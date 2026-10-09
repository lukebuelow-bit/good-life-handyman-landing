import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import { ATTRIBUTION_FIELDS } from "./attribution.js";
import { HANDYMAN_SMS_CONSENT_REQUIRED } from "./handyman-consent.js";
import {
  fieldLengthError,
  hasAllowedRequestSource,
  honeypotFilled,
  isAllowedLeadUrl,
  isProductionEnv,
  normalizeUsPhone,
  submittedTooFast
} from "./lead-guard.js";
import handler, {
  acceptedLeadBody,
  buildHcpLead,
  leadFormPolicy,
  screenLeadRequest
} from "./hcp-lead.js";

// These tests mock fetch. They must not request /api/hcp-lead or
// https://api.housecallpro.com/leads — each of those creates a real lead.

const nativeFetch = globalThis.fetch;
const envSnapshot = {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
  HCP_API_KEY: process.env.HCP_API_KEY
};

const NOW = new Date("2026-09-27T18:00:00.000Z");
const ORIGIN = "https://handyman.goodlifehomeco.pro";
const FAKE_SUCCESS = acceptedLeadBody(null);

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
    projectList: "Sticky door",
    email: "jordan@example.com",
    pageUrl: `${ORIGIN}/`,
    company_website: "",
    form_started_at: Date.now() - 10000,
    ...overrides
  };
}

function validHeaders(overrides = {}) {
  return {
    origin: ORIGIN,
    referer: `${ORIGIN}/`,
    ...overrides
  };
}

function mockReq(body, headers = validHeaders()) {
  return { method: "POST", body, headers };
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

function blockOutboundFetch() {
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    throw new Error(`Blocked outbound request during tests: ${url}`);
  };
}

function mockHcpSuccess() {
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    fetchCalls.push(href);
    if (href !== "https://api.housecallpro.com/leads") {
      throw new Error(`Unexpected URL in test mock: ${href}`);
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "lead_mock_1", customer: { id: "cus_mock_1" } }),
      init
    };
  };
}

beforeEach(() => {
  fetchCalls = [];
  process.env.NODE_ENV = "test";
  process.env.VERCEL_ENV = "production";
  process.env.HCP_API_KEY = "test-key-do-not-use";
  blockOutboundFetch();
});

afterEach(() => {
  globalThis.fetch = nativeFetch;
  leadFormPolicy.requireSmsConsent = HANDYMAN_SMS_CONSENT_REQUIRED;
  restoreEnv();
});

function readyBody(overrides = {}) {
  return {
    name: "Jordan Lee",
    phone: "9705550100",
    zip: "80525",
    company_website: "",
    form_started_at: NOW.getTime() - 5000,
    pageUrl: `${ORIGIN}/`,
    ...overrides
  };
}

function readyOptions(overrides = {}) {
  return {
    now: NOW,
    origin: ORIGIN,
    referer: `${ORIGIN}/`,
    production: true,
    ...overrides
  };
}

test("phone normalization accepts a 10-digit US number and a leading 1", () => {
  const accepted = [
    "9705550100",
    "19705550100",
    "+1 (970) 555-0100",
    "1-970-555-0100",
    "970.555.0100",
    "  970 555 0100  "
  ];
  for (const phone of accepted) {
    assert.equal(normalizeUsPhone(phone), "9705550100", phone);
  }

  const rejected = [
    "",
    "555-0100",
    "123",
    "0705550100",
    "1705550100",
    "9700550100",
    "9701550100",
    "1111111111",
    "1-070-555-0100",
    "+44 20 7946 0958",
    "9705550100x12"
  ];
  for (const phone of rejected) {
    assert.equal(normalizeUsPhone(phone), null, phone);
  }
});

test("buildHcpLead stores the normalized phone and rejects an invalid one", () => {
  const formatted = buildHcpLead(
    { name: "Jordan Lee", phone: "+1 (970) 555-0100", zip: "80525" },
    { now: NOW.toISOString() }
  );
  assert.equal(formatted.ok, true);
  assert.equal(formatted.body.customer.mobile_number, "9705550100");

  const invalid = buildHcpLead(
    { name: "Jordan Lee", phone: "555-0100", zip: "80525" },
    { now: NOW.toISOString() }
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /10-digit/);
  assert.equal(fetchCalls.length, 0);
});

test("timing drops missing, unparseable, and sub-3-second submits", () => {
  assert.equal(submittedTooFast(undefined, NOW), true);
  assert.equal(submittedTooFast("", NOW), true);
  assert.equal(submittedTooFast("   ", NOW), true);
  assert.equal(submittedTooFast("not-a-time", NOW), true);
  assert.equal(submittedTooFast(NOW.getTime() - 2999, NOW), true);
  assert.equal(submittedTooFast(String(NOW.getTime() - 2999), NOW), true);
  assert.equal(submittedTooFast(NOW.getTime() - 3000, NOW), false);
  assert.equal(submittedTooFast(new Date(NOW.getTime() - 5000).toISOString(), NOW), false);
});

test("origin allow-list is goodlife https, localhost off production, never vercel.app", () => {
  const allowed = [
    "https://goodlifehomeco.pro",
    "https://goodlifehomeco.pro/",
    "https://handyman.goodlifehomeco.pro",
    "https://HANDYMAN.goodlifehomeco.pro/quote",
    "https://a.b.goodlifehomeco.pro/path?q=1"
  ];
  for (const value of allowed) {
    assert.equal(isAllowedLeadUrl(value, { production: true }), true, value);
  }

  const denied = [
    "http://goodlifehomeco.pro",
    "http://handyman.goodlifehomeco.pro",
    "https://notgoodlifehomeco.pro",
    "https://goodlifehomeco.pro.evil.com",
    "https://evil.example/?next=https://goodlifehomeco.pro",
    "https://good-life-handyman-landing.vercel.app",
    "https://foo.vercel.app",
    "https://vercel.app",
    "null",
    ""
  ];
  for (const value of denied) {
    assert.equal(isAllowedLeadUrl(value, { production: false }), false, value);
  }

  assert.equal(isAllowedLeadUrl("http://localhost:5173/", { production: false }), true);
  assert.equal(isAllowedLeadUrl("http://127.0.0.1:3000/", { production: false }), true);
  assert.equal(isAllowedLeadUrl("http://[::1]:5173/", { production: false }), true);
  assert.equal(isAllowedLeadUrl("https://localhost/", { production: false }), true);
  assert.equal(isAllowedLeadUrl("http://localhost:5173/", { production: true }), false);
  assert.equal(isAllowedLeadUrl("http://127.0.0.1:3000/", { production: true }), false);

  assert.equal(hasAllowedRequestSource("", "", { production: true }), false);
  assert.equal(hasAllowedRequestSource(ORIGIN, "", { production: true }), true);
  assert.equal(hasAllowedRequestSource("", `${ORIGIN}/thanks`, { production: true }), true);
  assert.equal(
    hasAllowedRequestSource("https://foo.vercel.app", ORIGIN, { production: true }),
    false
  );
});

test("isProductionEnv follows VERCEL_ENV before NODE_ENV", () => {
  assert.equal(isProductionEnv({ VERCEL_ENV: "production", NODE_ENV: "production" }), true);
  assert.equal(isProductionEnv({ VERCEL_ENV: "preview", NODE_ENV: "production" }), false);
  assert.equal(isProductionEnv({ VERCEL_ENV: "development", NODE_ENV: "production" }), false);
  assert.equal(isProductionEnv({ NODE_ENV: "production" }), true);
  assert.equal(isProductionEnv({ NODE_ENV: "test" }), false);
  assert.equal(isProductionEnv({}), false);
});

test("length caps reject names, email, address fields, and notes", () => {
  assert.equal(fieldLengthError(readyBody({ name: "A".repeat(80) })), null);
  assert.match(fieldLengthError(readyBody({ name: "A".repeat(81) })), /80/);
  assert.match(fieldLengthError(readyBody({ first: "A".repeat(81) })), /80/);
  assert.match(fieldLengthError(readyBody({ last: "A".repeat(81) })), /80/);

  const email254 = `${"a".repeat(64)}@${"b".repeat(186)}.co`;
  assert.equal(email254.length, 254);
  assert.equal(fieldLengthError(readyBody({ email: email254 })), null);
  assert.match(fieldLengthError(readyBody({ email: `${email254}x` })), /254/);

  assert.equal(fieldLengthError(readyBody({ address: "A".repeat(200) })), null);
  assert.match(fieldLengthError(readyBody({ address: "A".repeat(201) })), /200/);
  assert.match(fieldLengthError(readyBody({ city: "A".repeat(201) })), /200/);
  assert.match(fieldLengthError(readyBody({ zip: "8".repeat(201) })), /200/);

  assert.equal(fieldLengthError(readyBody({ projectList: "A".repeat(2000) })), null);
  assert.match(fieldLengthError(readyBody({ projectList: "A".repeat(2001) })), /2000/);
  assert.match(fieldLengthError(readyBody({ notes: "A".repeat(2001) })), /2000/);
});

test("honeypot ignores blank values and trips on any other value", () => {
  assert.equal(honeypotFilled({ company_website: "" }), false);
  assert.equal(honeypotFilled({ company_website: "   " }), false);
  assert.equal(honeypotFilled({}), false);
  assert.equal(honeypotFilled({ company_website: "https://spam.example" }), true);
  assert.equal(honeypotFilled({ company_website: ["https://spam.example"] }), true);
});

test("screenLeadRequest accepts a normal lead without calling Housecall Pro", () => {
  const result = screenLeadRequest(
    readyBody({ phone: "+1 (970) 555-0100", email: "jordan@example.com" }),
    readyOptions()
  );
  assert.equal(result.disposition, "ok");
  assert.equal(result.lead.customer.mobile_number, "9705550100");
  assert.equal(Object.hasOwn(result.lead, "company_website"), false);
  assert.equal(Object.hasOwn(result.lead, "form_started_at"), false);
  assert.equal(fetchCalls.length, 0);
});

test("sms consent stays optional unless the checkbox is required", () => {
  assert.equal(HANDYMAN_SMS_CONSENT_REQUIRED, false);

  const optional = screenLeadRequest(readyBody(), readyOptions());
  assert.equal(optional.disposition, "ok");
  assert.deepEqual(optional.lead.tags, []);

  const required = screenLeadRequest(readyBody({ smsConsent: false }), readyOptions({
    requireSmsConsent: true
  }));
  assert.equal(required.disposition, "invalid");
  assert.equal(required.status, 400);
  assert.match(required.error, /consent/i);

  const checked = screenLeadRequest(readyBody({ smsConsent: true }), readyOptions({
    requireSmsConsent: true
  }));
  assert.equal(checked.disposition, "ok");
  assert.deepEqual(checked.lead.tags, ["nurture-handyman"]);
  assert.equal(fetchCalls.length, 0);
});

async function expectDrop(body, headers, reason) {
  const res = mockRes();
  await handler(mockReq(body, headers), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, FAKE_SUCCESS);
  assert.equal(fetchCalls.length, 0, reason);
}

test("honeypot returns the success shape and does not call Housecall Pro", async () => {
  await expectDrop(
    validBody({ company_website: "https://spam.example", phone: "123" }),
    validHeaders(),
    "honeypot"
  );
});

test("a too-fast or missing timestamp is a silent drop", async () => {
  await expectDrop(validBody({ form_started_at: Date.now() }), validHeaders(), "too fast");
  fetchCalls = [];
  await expectDrop(validBody({ form_started_at: undefined }), validHeaders(), "missing");
  fetchCalls = [];
  await expectDrop(validBody({ form_started_at: "yesterday" }), validHeaders(), "unparseable");
});

test("bad, missing, and vercel.app origins are silent drops", async () => {
  await expectDrop(validBody(), { origin: "https://foo.vercel.app", referer: `${ORIGIN}/` }, "vercel.app");
  fetchCalls = [];
  await expectDrop(validBody(), {}, "missing origin");
  fetchCalls = [];
  await expectDrop(
    validBody(),
    { origin: "https://evil.example", referer: "https://evil.example/form" },
    "foreign origin"
  );
});

test("localhost is dropped in production and allowed outside it", async () => {
  const headers = { origin: "http://localhost:5173", referer: "http://localhost:5173/" };
  await expectDrop(validBody(), headers, "localhost production");

  delete process.env.VERCEL_ENV;
  process.env.NODE_ENV = "test";
  mockHcpSuccess();
  const res = mockRes();
  await handler(mockReq(validBody(), headers), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.leadId, "lead_mock_1");
  assert.equal(fetchCalls.length, 1);
});

test("a bad phone is a 400 and does not call Housecall Pro", async () => {
  const res = mockRes();
  await handler(mockReq(validBody({ phone: "555-0199" })), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /10-digit/);
  assert.equal(fetchCalls.length, 0);
});

test("over-length fields are a 400 and do not call Housecall Pro", async () => {
  const cases = [
    { name: "A".repeat(81) },
    { email: `${"a".repeat(250)}@example.com` },
    { address: "A".repeat(201) },
    { projectList: "A".repeat(2001) }
  ];
  for (const overrides of cases) {
    fetchCalls = [];
    const res = mockRes();
    await handler(mockReq(validBody(overrides)), res);
    assert.equal(res.statusCode, 400, JSON.stringify(overrides));
    assert.equal(res.body.ok, false);
    assert.equal(fetchCalls.length, 0);
  }
});

test("missing consent is a 400 and does not call Housecall Pro when the checkbox is required", async () => {
  leadFormPolicy.requireSmsConsent = true;
  const res = mockRes();
  await handler(mockReq(validBody({ smsConsent: false })), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /consent/i);
  assert.equal(fetchCalls.length, 0);
});

test("missing consent still creates a lead when the checkbox is not required", async () => {
  assert.equal(leadFormPolicy.requireSmsConsent, false);
  mockHcpSuccess();
  const res = mockRes();
  const body = validBody();
  delete body.smsConsent;
  await handler(mockReq(body), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.leadId, "lead_mock_1");
  assert.equal(res.body.message, FAKE_SUCCESS.message);
  assert.equal(fetchCalls.length, 1);
});

test("a valid lead posts once to the mocked Housecall Pro endpoint", async () => {
  let sent;
  globalThis.fetch = async (url, init) => {
    fetchCalls.push(String(url));
    assert.equal(String(url), "https://api.housecallpro.com/leads");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Authorization, "Bearer test-key-do-not-use");
    sent = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "lead_mock_1", customer: { id: "cus_mock_1" } })
    };
  };

  const res = mockRes();
  await handler(mockReq(validBody({ company_website: "   ", smsConsent: true })), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    message: "Handyman quote request created successfully.",
    leadId: "lead_mock_1"
  });
  assert.equal(sent.customer.mobile_number, "9705550100");
  assert.equal(sent.customer.email, "jordan@example.com");
  assert.deepEqual(sent.tags, ["nurture-handyman"]);
  for (const key of ATTRIBUTION_FIELDS) {
    assert.match(sent.customer.notes, new RegExp(`^${key}: $`, "m"));
  }
  assert.equal(Object.hasOwn(sent, "company_website"), false);
  assert.equal(Object.hasOwn(sent, "form_started_at"), false);
  assert.equal(fetchCalls.length, 1);
});

test("a mocked Housecall Pro lead stores body attribution ahead of pageUrl", async () => {
  let sent;
  globalThis.fetch = async (url, init) => {
    fetchCalls.push(String(url));
    assert.equal(String(url), "https://api.housecallpro.com/leads");
    sent = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "lead_mock_utm", customer: { id: "cus_mock_utm" } })
    };
  };

  const res = mockRes();
  await handler(mockReq(validBody({
    pageUrl: `${ORIGIN}/?utm_source=from-url&utm_medium=cpc&fbclid=url-click`,
    utm_source: "from-body",
    utm_campaign: "unfinished-list",
    utm_content: "video",
    utm_term: "sticky door",
    fbclid: ""
  })), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.leadId, "lead_mock_utm");
  assert.equal(fetchCalls.length, 1);
  assert.match(sent.customer.notes, /^utm_source: from-body$/m);
  assert.match(sent.customer.notes, /^utm_medium: cpc$/m);
  assert.match(sent.customer.notes, /^utm_campaign: unfinished-list$/m);
  assert.match(sent.customer.notes, /^utm_content: video$/m);
  assert.match(sent.customer.notes, /^utm_term: sticky door$/m);
  assert.match(sent.customer.notes, /^fbclid: url-click$/m);
  assert.equal(sent.customer.notes.includes("utm_source: fb\n") || sent.customer.notes.includes("utm_source: fb"), false);
});

test("tests refuse a live Housecall Pro call when fetch is not mocked", async () => {
  globalThis.fetch = nativeFetch;
  await assert.rejects(
    () => handler(mockReq(validBody()), mockRes()),
    /Refusing live Housecall Pro call/
  );
  assert.equal(globalThis.fetch, nativeFetch);
});

test("the form keeps the honeypot, load time, and success-only Lead event", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(app, /name="company_website"/);
  assert.match(app, /aria-hidden="true"/);
  assert.match(app, /tabIndex=\{-1\}/);
  assert.match(app, /autoComplete="off"/);
  assert.match(app, /name="form_started_at"/);
  assert.match(app, /form_started_at:formStartedAt/);
  assert.match(app, /company_website:companyWebsiteRef\.current\?companyWebsiteRef\.current\.value:''/);
  assert.match(css, /translateX\(-100vw\)/);
  assert.match(app, /if\(!r\.ok\) throw new Error\('submit failed'\);/);
  assert.match(app, /let leadPayload=null;\s*try\{leadPayload=await r\.json\(\)\}catch\(err\)\{leadPayload=null\}\s*await trackSuccessfulLead\(eventIdFromLeadPayload\(leadPayload\)\);/);
  assert.match(entry, /import \{ inject \} from '@vercel\/analytics'/);
  assert.match(entry, /\binject\(\)/);
});
