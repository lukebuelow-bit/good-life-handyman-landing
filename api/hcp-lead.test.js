import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HANDYMAN_LEAD_SOURCE,
  HANDYMAN_NURTURE_TAG,
  HANDYMAN_SMS_CONSENT_BODY,
  HANDYMAN_SMS_CONSENT_LEAD,
  HANDYMAN_SMS_CONSENT_TEXT,
  HANDYMAN_SMS_CONSENT_VERSION,
  HANDYMAN_SMS_LINK_SEPARATOR,
  HANDYMAN_SMS_PRIVACY_LABEL,
  HANDYMAN_SMS_SMALL_PRINT,
  HANDYMAN_SMS_TERMS_LABEL
} from "./handyman-consent.js";
import { applyLeadSourceAndTags, buildHcpLead } from "./hcp-lead.js";

// These tests call buildHcpLead only. They must not request /api/hcp-lead
// or https://api.housecallpro.com/leads — each of those creates a real lead.

const APPROVED_CONSENT_TEXT =
  "Yes, text me. I agree that Good Life Home Co. may send me automated marketing and follow-up text messages about my Unfinished List and in-home quote at the mobile number I entered. Consent is not a condition of purchase. Up to 6 messages over about 8 weeks. Msg & data rates may apply. Reply STOP to opt out, HELP for help. [SMS Terms] \u00b7 [Privacy Policy]";

const APPROVED_SMALL_PRINT =
  "By submitting, you're asking Good Life Home Co. to contact you about this request. We'll call you at the number above to schedule. We don't sell or share your mobile number or text consent with third parties for their marketing.";

const NOW = "2026-09-26T16:00:00.000Z";
const PAGE = "https://handyman.goodlifehomeco.pro/";
const REFERER = "https://handyman.goodlifehomeco.pro/referer-fallback";

function base(overrides = {}) {
  return {
    name: "Jordan Lee",
    phone: "9705550100",
    zip: "80525",
    projectList: "Sticky door",
    ...overrides
  };
}

function build(overrides = {}, options = {}) {
  return buildHcpLead(base(overrides), { now: NOW, ...options });
}

test("approved handyman consent text and small print are verbatim", () => {
  assert.equal(HANDYMAN_SMS_CONSENT_TEXT, APPROVED_CONSENT_TEXT);
  assert.equal(
    HANDYMAN_SMS_CONSENT_LEAD +
      HANDYMAN_SMS_CONSENT_BODY +
      HANDYMAN_SMS_TERMS_LABEL +
      HANDYMAN_SMS_LINK_SEPARATOR +
      HANDYMAN_SMS_PRIVACY_LABEL,
    APPROVED_CONSENT_TEXT
  );
  assert.equal(HANDYMAN_SMS_LINK_SEPARATOR, " \u00b7 ");
  assert.equal(HANDYMAN_SMS_CONSENT_VERSION, "handyman-sms-v1-2026-09-26");
  assert.equal(HANDYMAN_SMS_SMALL_PRINT, APPROVED_SMALL_PRINT);
  assert.equal(HANDYMAN_LEAD_SOURCE, "LP-Handyman");
  assert.equal(HANDYMAN_NURTURE_TAG, "nurture-handyman");
});

test("applyLeadSourceAndTags sets lead_source and tags on the lead and the customer", () => {
  const mapped = applyLeadSourceAndTags(
    { customer: { first_name: "Jordan" } },
    { leadSource: "LP-Handyman", tags: ["nurture-handyman"] }
  );

  assert.deepEqual(mapped, {
    lead_source: "LP-Handyman",
    tags: ["nurture-handyman"],
    customer: {
      first_name: "Jordan",
      lead_source: "LP-Handyman",
      tags: ["nurture-handyman"]
    }
  });
  assert.notEqual(mapped.tags, mapped.customer.tags);
});

test("consent yes with email sets nurture tag, lead source, and the consent record", () => {
  const result = build({
    email: " jordan@example.com ",
    smsConsent: true,
    pageUrl: PAGE
  }, { referer: REFERER });

  assert.equal(result.ok, true);
  const { body } = result;
  assert.equal(body.lead_source, "LP-Handyman");
  assert.deepEqual(body.tags, ["nurture-handyman"]);
  assert.equal(body.customer.lead_source, "LP-Handyman");
  assert.deepEqual(body.customer.tags, ["nurture-handyman"]);
  assert.equal(body.customer.email, "jordan@example.com");
  assert.equal(body.customer.first_name, "Jordan");
  assert.equal(body.customer.last_name, "Lee");

  const notes = body.customer.notes;
  const consentAt = notes.indexOf("SMS consent: Yes");
  assert.notEqual(consentAt, -1);
  const record = notes.slice(consentAt);
  assert.equal(
    record,
    [
      "SMS consent: Yes",
      NOW,
      PAGE,
      "handyman-sms-v1-2026-09-26",
      APPROVED_CONSENT_TEXT
    ].join("\n")
  );
  assert.equal(notes.includes(REFERER), false);
  assert.equal(notes.includes("SMS consent: No"), false);
});

test("consent no omits the nurture tag, email, and verbatim consent text", () => {
  const result = build({ smsConsent: false }, { referer: REFERER });

  assert.equal(result.ok, true);
  const { body } = result;
  assert.equal(body.lead_source, "LP-Handyman");
  assert.deepEqual(body.tags, []);
  assert.equal(body.customer.lead_source, "LP-Handyman");
  assert.deepEqual(body.customer.tags, []);
  assert.equal(Object.hasOwn(body.customer, "email"), false);

  const notes = body.customer.notes;
  const consentAt = notes.indexOf("SMS consent: No");
  assert.notEqual(consentAt, -1);
  assert.equal(
    notes.slice(consentAt),
    [
      "SMS consent: No",
      NOW,
      REFERER,
      "handyman-sms-v1-2026-09-26"
    ].join("\n")
  );
  assert.equal(notes.includes(APPROVED_CONSENT_TEXT), false);
  assert.equal(notes.includes("Yes, text me."), false);
  assert.equal(notes.includes("nurture-handyman"), false);
});

test("email absent when omitted or blank, and consent still records No", () => {
  for (const email of [undefined, "", "   "]) {
    const result = build({ email });
    assert.equal(result.ok, true, `expected ok for email ${JSON.stringify(email)}`);
    assert.equal(Object.hasOwn(result.body.customer, "email"), false);
    assert.deepEqual(result.body.tags, []);
    assert.match(result.body.customer.notes, /SMS consent: No/);
    assert.equal(result.body.customer.notes.includes(APPROVED_CONSENT_TEXT), false);
  }
});

test("invalid email is rejected for consent yes and no", () => {
  const invalid = ["not-an-email", "ada@", "@example.com", "ada@example", "ada @example.com", "ada@@example.com"];
  for (const email of invalid) {
    for (const smsConsent of [true, false]) {
      const result = build({ email, smsConsent });
      assert.equal(result.ok, false, `expected reject for ${email} consent=${smsConsent}`);
      assert.equal(result.body, undefined);
      assert.match(result.error, /valid email/i);
    }
  }
});

test("a valid email without consent is kept and does not add the nurture tag", () => {
  const result = build({ email: "jordan@example.com", smsConsent: false, pageUrl: PAGE });
  assert.equal(result.ok, true);
  assert.equal(result.body.customer.email, "jordan@example.com");
  assert.deepEqual(result.body.tags, []);
  assert.deepEqual(result.body.customer.tags, []);
  assert.match(result.body.customer.notes, /SMS consent: No/);
});

test("pageUrl is preferred over Referer", () => {
  const result = build({ smsConsent: true, pageUrl: PAGE }, { referer: REFERER });
  assert.match(result.body.customer.notes, new RegExp(PAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(result.body.customer.notes.includes(REFERER), false);
});

test("non-boolean smsConsent does not opt in", () => {
  for (const smsConsent of [undefined, null, "true", "yes", 1, "false"]) {
    const result = build({ smsConsent, pageUrl: PAGE });
    assert.equal(result.ok, true);
    assert.deepEqual(result.body.tags, []);
    assert.match(result.body.customer.notes, /SMS consent: No/);
    assert.equal(result.body.customer.notes.includes(APPROVED_CONSENT_TEXT), false);
  }
});
