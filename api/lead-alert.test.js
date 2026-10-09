import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import handler, { buildHcpLead, leadFormPolicy } from "./hcp-lead.js";
import { HANDYMAN_SMS_CONSENT_REQUIRED } from "./handyman-consent.js";
import {
  buildLeadAlert,
  deliverLeadAlert,
  formatDenverTime,
  parseAlertRecipients,
  setLeadAlertTransport
} from "./lead-alert.js";

const nativeFetch = globalThis.fetch;
const ORIGIN = "https://handyman.goodlifehomeco.pro";
const NOW = new Date("2026-09-27T18:00:00.000Z");
const envSnapshot = {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
  HCP_API_KEY: process.env.HCP_API_KEY,
  LEAD_ALERT_SMTP_USER: process.env.LEAD_ALERT_SMTP_USER,
  LEAD_ALERT_SMTP_PASS: process.env.LEAD_ALERT_SMTP_PASS,
  LEAD_ALERT_TO: process.env.LEAD_ALERT_TO
};

let sent;
let fetchCalls;

function restoreEnv() {
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function validBody(overrides = {}) {
  return {
    name: "Jordan Lee",
    phone: "(970) 555-0100",
    zip: "80525",
    city: "Fort Collins",
    address: "123 Linden St",
    projectList: "Sticky door",
    email: "jordan@example.com",
    pageUrl: `${ORIGIN}/?utm_source=facebook&utm_medium=cpc&utm_campaign=unfinished&fbclid=IwAR123`,
    company_website: "",
    form_started_at: Date.now() - 10000,
    ...overrides
  };
}

function smtpEnv() {
  return {
    NODE_ENV: "production",
    LEAD_ALERT_SMTP_USER: "alerts@goodlifehomeco.pro",
    LEAD_ALERT_SMTP_PASS: "test-pass",
    LEAD_ALERT_TO: "luke@example.com, office@example.com"
  };
}

function sampleAlert(overrides = {}) {
  const body = validBody();
  const built = buildHcpLead(body, { now: NOW });
  assert.equal(built.ok, true);
  return {
    body,
    lead: built.body,
    saved: true,
    leadId: "lea_123",
    now: NOW,
    ...overrides
  };
}

function mockReq(body) {
  return {
    method: "POST",
    body,
    headers: { origin: ORIGIN, referer: `${ORIGIN}/` }
  };
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

beforeEach(() => {
  sent = [];
  fetchCalls = [];
  process.env.NODE_ENV = "test";
  process.env.VERCEL_ENV = "production";
  process.env.HCP_API_KEY = "test-key-do-not-use";
  process.env.LEAD_ALERT_SMTP_USER = "alerts@goodlifehomeco.pro";
  process.env.LEAD_ALERT_SMTP_PASS = "test-pass";
  process.env.LEAD_ALERT_TO = "luke@example.com, office@example.com";
  setLeadAlertTransport({
    async sendMail(message) {
      sent.push(message);
      return { messageId: "test-message" };
    }
  });
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    throw new Error(`Blocked outbound request during tests: ${url}`);
  };
});

afterEach(() => {
  setLeadAlertTransport(null);
  globalThis.fetch = nativeFetch;
  leadFormPolicy.requireSmsConsent = HANDYMAN_SMS_CONSENT_REQUIRED;
  restoreEnv();
});

test("recipients are split on commas and header newlines are dropped", () => {
  assert.deepEqual(parseAlertRecipients(" luke@example.com, office@example.com "), [
    "luke@example.com",
    "office@example.com"
  ]);
  assert.deepEqual(parseAlertRecipients("ok@example.com, bad\r\n@evil.test"), ["ok@example.com"]);
});

test("the alert uses the first name, city, tel link, UTMs, and Denver time", () => {
  const alert = buildLeadAlert(sampleAlert());
  assert.equal(alert.subject, "New handyman lead: Jordan (Fort Collins)");
  assert.match(alert.text, /Name: Jordan Lee/);
  assert.match(alert.text, /Phone: \(970\) 555-0100/);
  assert.match(alert.text, /Phone link: tel:\+19705550100/);
  assert.match(alert.html, /href="tel:\+19705550100"/);
  assert.match(alert.text, /Email: jordan@example.com/);
  assert.match(alert.text, /Address: 123 Linden St, Fort Collins CO, 80525/);
  assert.match(alert.text, /Job requested: Sticky door/);
  assert.match(alert.text, /Lead source: LP-Handyman/);
  assert.match(alert.text, /HCP lead id: lea_123/);
  assert.match(alert.text, /utm_source: facebook/);
  assert.match(alert.text, /utm_medium: cpc/);
  assert.match(alert.text, /utm_campaign: unfinished/);
  assert.match(alert.text, /fbclid: IwAR123/);
  assert.match(alert.text, /utm_term: Not provided/);
  assert.match(alert.html, /Sticky door/);
  assert.match(alert.text, new RegExp(formatDenverTime(NOW).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(formatDenverTime(NOW), /Sep 27, 2026/);
  assert.match(formatDenverTime(NOW), /12:00:00 PM MDT/);
});

test("a lead with no city uses the ZIP, and HTML is escaped", () => {
  const body = validBody({
    name: "Sam <script>",
    city: "",
    address: "",
    pageUrl: `${ORIGIN}/`
  });
  const built = buildHcpLead(body, { now: NOW });
  const alert = buildLeadAlert({ body, lead: built.body, saved: true, leadId: "lea_9", now: NOW });
  assert.equal(alert.subject, "New handyman lead: Sam (80525)");
  assert.equal(alert.html.includes("<script>"), false);
  assert.match(alert.html, /Sam &lt;script&gt;/);
});

test("an unsaved lead keeps the full details and the failure subject", () => {
  const alert = buildLeadAlert(sampleAlert({
    saved: false,
    leadId: null,
    failure: "Housecall Pro rejected the lead (HTTP 422)."
  }));
  assert.equal(alert.subject, "LEAD NOT SAVED IN HCP: Jordan (Fort Collins)");
  assert.match(alert.text, /Saved in Housecall Pro: No/);
  assert.match(alert.text, /HTTP 422/);
  assert.match(alert.text, /HCP lead id: Not saved/);
  assert.match(alert.text, /Jordan Lee/);
  assert.match(alert.html, /href="tel:\+19705550100"/);
});

test("deliverLeadAlert sends from the website name to every recipient", async () => {
  const messages = [];
  const result = await deliverLeadAlert(sampleAlert(), {
    env: smtpEnv(),
    transport: {
      async sendMail(message) {
        messages.push(message);
        return { messageId: "abc" };
      }
    }
  });
  assert.equal(result.ok, true);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].from, "Good Life Website <alerts@goodlifehomeco.pro>");
  assert.equal(messages[0].to, "luke@example.com, office@example.com");
  assert.equal(messages[0].subject, "New handyman lead: Jordan (Fort Collins)");
  assert.match(messages[0].text, /Sticky door/);
  assert.match(messages[0].html, /tel:\+19705550100/);
});

test("a hung SMTP send stops at the timeout without logging the lead", async () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try {
    const result = await deliverLeadAlert(sampleAlert(), {
      timeoutMs: 30,
      env: smtpEnv(),
      transport: { sendMail: () => new Promise(() => {}) }
    });
    assert.equal(result.ok, false);
  } finally {
    console.error = original;
  }
  const logged = JSON.stringify(errors);
  assert.match(logged, /LEAD_ALERT_TIMEOUT/);
  assert.equal(logged.includes("jordan@example.com"), false);
  assert.equal(logged.includes("970"), false);
  assert.equal(logged.includes("Sticky door"), false);
});

test("missing SMTP settings fail the alert and still hide the lead", async () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try {
    const result = await deliverLeadAlert(sampleAlert(), {
      env: { NODE_ENV: "production" }
    });
    assert.equal(result.ok, false);
  } finally {
    console.error = original;
  }
  const logged = JSON.stringify(errors);
  assert.match(logged, /MISSING_SMTP_ENV/);
  assert.equal(logged.includes("jordan@example.com"), false);
});

test("a created lead returns 200 and sends one alert", async () => {
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    assert.equal(String(url), "https://api.housecallpro.com/leads");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "lea_real", customer: { id: "cus_real" } })
    };
  };
  const res = mockRes();
  await handler(mockReq(validBody()), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.leadId, "lea_real");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, "New handyman lead: Jordan (Fort Collins)");
  assert.match(sent[0].text, /HCP lead id: lea_real/);
  assert.equal(fetchCalls.length, 1);
});

test("honeypot and too-fast drops do not email or call Housecall Pro", async () => {
  const honeypot = mockRes();
  await handler(mockReq(validBody({ company_website: "https://spam.example" })), honeypot);
  assert.equal(honeypot.statusCode, 200);
  assert.equal(honeypot.body.leadId, null);
  assert.equal(sent.length, 0);
  assert.equal(fetchCalls.length, 0);

  const tooFast = mockRes();
  await handler(mockReq(validBody({ form_started_at: Date.now() })), tooFast);
  assert.equal(tooFast.statusCode, 200);
  assert.equal(sent.length, 0);
  assert.equal(fetchCalls.length, 0);
});

test("a Housecall Pro rejection still emails and returns the error", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 422,
    text: async () => JSON.stringify({ error: "rejected" })
  });
  const res = mockRes();
  await handler(mockReq(validBody()), res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.ok, false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, "LEAD NOT SAVED IN HCP: Jordan (Fort Collins)");
  assert.match(sent[0].text, /HTTP 422/);
  assert.match(sent[0].text, /jordan@example.com/);
});

test("an SMTP failure still returns the created lead", async () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ id: "lea_mail_fail", customer: { id: "cus_mail_fail" } })
  });
  setLeadAlertTransport({
    async sendMail() {
      const error = new Error("Invalid login for jordan@example.com");
      error.code = "EAUTH";
      throw error;
    }
  });
  try {
    const res = mockRes();
    await handler(mockReq(validBody()), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.leadId, "lea_mail_fail");
  } finally {
    console.error = original;
  }
  const logged = JSON.stringify(errors);
  assert.match(logged, /EAUTH/);
  assert.equal(logged.includes("jordan@example.com"), false);
  assert.equal(logged.includes("970"), false);
});
