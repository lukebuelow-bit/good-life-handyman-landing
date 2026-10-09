import {
  HANDYMAN_LEAD_SOURCE,
  HANDYMAN_NURTURE_TAG,
  HANDYMAN_SMS_CONSENT_REQUIRED,
  HANDYMAN_SMS_CONSENT_TEXT,
  HANDYMAN_SMS_CONSENT_VERSION
} from "./handyman-consent.js";
import { deliverLeadAlert } from "./lead-alert.js";
import {
  fieldLengthError,
  hasAllowedRequestSource,
  honeypotFilled,
  isProductionEnv,
  normalizeUsPhone,
  submittedTooFast
} from "./lead-guard.js";

export const ACCEPTED_LEAD_MESSAGE = "Handyman quote request created successfully.";
export const HCP_LEADS_URL = "https://api.housecallpro.com/leads";

// Read at request time so tests can cover the required-consent branch.
export const leadFormPolicy = {
  requireSmsConsent: HANDYMAN_SMS_CONSENT_REQUIRED
};

const nativeFetch = globalThis.fetch;

export function acceptedLeadBody(leadId) {
  return {
    ok: true,
    message: ACCEPTED_LEAD_MESSAGE,
    leadId: leadId || null
  };
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isZip(value) {
  return /^\d{5}(?:-\d{4})?$/.test(value);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function resolveName(body) {
  const first = clean(body.first);
  const last = clean(body.last);
  const name = clean(body.name);

  if (first || last) {
    return {
      entered: [first, last].filter(Boolean).join(" "),
      first_name: first,
      last_name: last
    };
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { entered: "", first_name: "", last_name: "" };
  }

  return {
    entered: name,
    first_name: parts[0],
    last_name: parts.slice(1).join(" ")
  };
}

function resolveLocation(body) {
  const street = clean(body.address);
  const city = clean(body.city);
  let zip = clean(body.zip);
  const cityOrZip = clean(body.cityOrZip);

  if (!zip && isZip(cityOrZip)) zip = cityOrZip;

  return { street, city, zip };
}

function toIsoUtc(now) {
  const date = now instanceof Date ? now : now ? new Date(now) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid consent timestamp.");
  }
  return date.toISOString();
}

function resolvePageUrl(body, options) {
  return clean(body.pageUrl) || clean(options.referer);
}

function smsConsentNote({ consented, recordedAt, pageUrl }) {
  const lines = [
    `SMS consent: ${consented ? "Yes" : "No"}`,
    recordedAt,
    pageUrl,
    HANDYMAN_SMS_CONSENT_VERSION
  ];
  if (consented) lines.push(HANDYMAN_SMS_CONSENT_TEXT);
  return lines.join("\n");
}

// Which Housecall Pro Create Lead fields persist lead source and tags is not
// yet verified. This is the only place that maps them. Default: send both
// top-level lead_source (string) and tags (string array) on the lead body,
// and the same lead_source and tags on the nested customer.
export function applyLeadSourceAndTags(lead, { leadSource, tags }) {
  const source = String(leadSource);
  const tagList = Array.isArray(tags) ? tags.map((tag) => String(tag)) : [];
  const customer = lead && lead.customer ? lead.customer : {};

  return {
    ...lead,
    lead_source: source,
    tags: [...tagList],
    customer: {
      ...customer,
      lead_source: source,
      tags: [...tagList]
    }
  };
}

// Housecall Pro Create Lead accepts a customer with first_name, last_name,
// mobile_number, optional email, notes, and addresses[{street,city,state,zip}].
// https://docs.housecallpro.com/docs/housecall-public-api/8961eaf9f1c28-create-lead
export function buildHcpLead(body, options = {}) {
  const source = body || {};
  const person = resolveName(source);
  const rawPhone = clean(source.phone);
  const phone = normalizeUsPhone(rawPhone);
  const email = clean(source.email);
  const projectList = clean(source.projectList);
  const preferredDay = clean(source.preferredDay);
  const preferredTime = clean(source.preferredTime);
  const location = resolveLocation(source);
  const consented = source.smsConsent === true;

  if (!person.first_name || !rawPhone || !location.zip) {
    return {
      ok: false,
      error: "Name, phone, and ZIP are required."
    };
  }

  if (!phone) {
    return {
      ok: false,
      error: "Enter a valid 10-digit US phone number."
    };
  }

  if (email && !isEmail(email)) {
    return {
      ok: false,
      error: "Enter a valid email address or leave email blank."
    };
  }

  const recordedAt = toIsoUtc(options.now);
  const pageUrl = resolvePageUrl(source, options);
  const summary = [
    "THE UNFINISHED LIST — HANDYMAN IN-HOME QUOTE",
    "",
    "Source: Good Life Handyman Landing Page",
    "",
    `Name: ${person.entered}`,
    `Projects / unfinished list: ${projectList || "Not provided"}`,
    `ZIP: ${location.zip}`,
    ...(location.city ? [`City: ${location.city}`] : []),
    location.street ? `Submitted address: ${location.street}` : "Street address: not collected",
    ...(preferredDay ? [`Preferred day: ${preferredDay}`] : []),
    ...(preferredTime ? [`Preferred time: ${preferredTime}`] : []),
    "",
    "Campaign: The Unfinished List",
    "CTA: Book Your In-Home Quote",
    "",
    smsConsentNote({ consented, recordedAt, pageUrl })
  ].join("\n");

  const customer = {
    first_name: person.first_name,
    mobile_number: phone,
    notes: summary
  };

  // A single given name has no last name. Send a non-empty last_name so HCP
  // does not reject the customer, and keep the typed name in notes.
  customer.last_name = person.last_name || "-";

  if (email) customer.email = email;

  const address = { state: "CO" };
  if (location.street) address.street = location.street;
  if (location.city) address.city = location.city;
  if (location.zip) address.zip = location.zip;

  // No street is collected. Repeat the ZIP as the street line so the
  // address object is not submitted with a blank street.
  if (!address.street) address.street = location.zip;

  customer.addresses = [address];

  const tags = consented ? [HANDYMAN_NURTURE_TAG] : [];
  const lead = applyLeadSourceAndTags(
    { customer },
    { leadSource: HANDYMAN_LEAD_SOURCE, tags }
  );

  return { ok: true, body: lead };
}

function headerValue(req, name) {
  const headers = req.headers || {};
  const key = String(name).toLowerCase();
  const value = headers[key] ?? headers[name];
  if (Array.isArray(value)) return value[0] || "";
  return typeof value === "string" ? value : "";
}

export function screenLeadRequest(body, options = {}) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const now = options.now instanceof Date ? options.now : new Date();
  const production = options.production ?? isProductionEnv();
  const requireSmsConsent = options.requireSmsConsent ?? leadFormPolicy.requireSmsConsent;

  if (honeypotFilled(source)) return { disposition: "drop", reason: "honeypot" };
  if (submittedTooFast(source.form_started_at, now)) return { disposition: "drop", reason: "too_fast" };
  if (!hasAllowedRequestSource(options.origin, options.referer, { production })) {
    return { disposition: "drop", reason: "origin" };
  }

  const lengthError = fieldLengthError(source);
  if (lengthError) return { disposition: "invalid", status: 400, error: lengthError };

  const rawPhone = clean(source.phone);
  if (rawPhone && !normalizeUsPhone(rawPhone)) {
    return {
      disposition: "invalid",
      status: 400,
      error: "Enter a valid 10-digit US phone number."
    };
  }

  if (requireSmsConsent && source.smsConsent !== true) {
    return { disposition: "invalid", status: 400, error: "Consent is required." };
  }

  const built = buildHcpLead(source, {
    now,
    referer: typeof options.referer === "string" ? options.referer : ""
  });
  if (!built.ok) return { disposition: "invalid", status: 400, error: built.error };
  return { disposition: "ok", lead: built.body };
}

async function alertForLead(details) {
  try {
    await deliverLeadAlert(details);
  } catch (error) {
    console.error("LEAD ALERT FAILED:", {
      code: error && error.code ? error.code : "LEAD_ALERT_ERROR"
    });
  }
}

async function postLead(body) {
  if (process.env.NODE_ENV === "test" && globalThis.fetch === nativeFetch) {
    const error = new Error("Refusing live Housecall Pro call from tests.");
    error.code = "HCP_TEST_GUARD";
    throw error;
  }

  return globalThis.fetch(HCP_LEADS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HCP_API_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const referer = headerValue(req, "referer") || headerValue(req, "referrer");
  const screened = screenLeadRequest(req.body, {
    now: new Date(),
    origin: headerValue(req, "origin"),
    referer,
    production: isProductionEnv()
  });

  if (screened.disposition === "drop") {
    console.log("HCP HANDYMAN LEAD DROPPED:", screened.reason);
    return res.status(200).json(acceptedLeadBody(null));
  }
  if (screened.disposition !== "ok") {
    return res.status(screened.status || 400).json({ ok: false, error: screened.error });
  }

  console.log("HCP_API_KEY present:", !!process.env.HCP_API_KEY);
  if (!process.env.HCP_API_KEY) {
    await alertForLead({
      body: req.body,
      lead: screened.lead,
      saved: false,
      failure: "HCP_API_KEY is missing."
    });
    return res.status(500).json({ ok: false, error: "HCP_API_KEY is missing" });
  }

  try {
    const response = await postLead(screened.lead);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!response.ok) {
      console.error("HCP HANDYMAN LEAD REJECTED:", response.status);
      await alertForLead({
        body: req.body,
        lead: screened.lead,
        saved: false,
        failure: `Housecall Pro rejected the lead (HTTP ${response.status}).`
      });
      return res.status(response.status).json({ ok: false, error: "Housecall Pro rejected the lead.", hcpStatus: response.status });
    }
    const leadId = data?.id || null;
    console.log("HCP HANDYMAN LEAD CREATED:", { status: response.status, leadId, customerId: data?.customer?.id || null });
    await alertForLead({
      body: req.body,
      lead: screened.lead,
      saved: true,
      leadId
    });
    return res.status(200).json(acceptedLeadBody(leadId));
  } catch (error) {
    if (error && error.code === "HCP_TEST_GUARD") throw error;
    console.error("HCP HANDYMAN LEAD ERROR:", error && error.code ? error.code : "HCP_LEAD_ERROR");
    await alertForLead({
      body: req.body,
      lead: screened.lead,
      saved: false,
      failure: "Unable to create the Housecall Pro lead."
    });
    return res.status(500).json({ ok: false, error: "Unable to create handyman quote request." });
  }
}
