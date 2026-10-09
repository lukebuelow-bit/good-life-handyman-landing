import nodemailer from "nodemailer";
import { HANDYMAN_LEAD_SOURCE } from "./handyman-consent.js";
import { normalizeUsPhone } from "./lead-guard.js";

export const LEAD_ALERT_TIMEOUT_MS = 5000;

const TRACKING_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid"
];

let injectedTransport = null;

export function setLeadAlertTransport(transport) {
  injectedTransport = transport || null;
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function safeHeader(value) {
  const trimmed = clean(value);
  if (!trimmed || /[\r\n]/.test(trimmed)) return "";
  return trimmed;
}

export function parseAlertRecipients(value) {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => safeHeader(item))
    .filter(Boolean);
}

function readSmtp(env) {
  const user = safeHeader(env.LEAD_ALERT_SMTP_USER);
  const pass = typeof env.LEAD_ALERT_SMTP_PASS === "string" ? env.LEAD_ALERT_SMTP_PASS.trim() : "";
  const to = parseAlertRecipients(env.LEAD_ALERT_TO);
  if (!user || !pass || !to.length) return null;
  return { user, pass, to };
}

export function formatDenverTime(now) {
  const date = now instanceof Date ? now : new Date(now || Date.now());
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function formatPhone(national) {
  if (!/^\d{10}$/.test(national || "")) return national || "";
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

function firstNameOf(body, customer) {
  const fromCustomer = clean(customer.first_name);
  if (fromCustomer) return fromCustomer;
  const fromBody = clean(body.first) || clean(body.name).split(/\s+/).filter(Boolean)[0];
  return fromBody || "Lead";
}

function displayName(body, customer) {
  const entered = clean(body.name) || [clean(body.first), clean(body.last)].filter(Boolean).join(" ");
  if (entered) return entered;
  const last = customer.last_name && customer.last_name !== "-" ? customer.last_name : "";
  return [customer.first_name, last].filter(Boolean).join(" ") || "Not provided";
}

function addressParts(body, leadAddress) {
  const street = clean(body.address) || clean(body.street);
  const city = clean(body.city) || clean(leadAddress.city);
  const state = clean(body.state) || clean(leadAddress.state);
  const zip = clean(body.zip) || (isZip(clean(body.cityOrZip)) ? clean(body.cityOrZip) : "") || clean(leadAddress.zip);
  const hcpStreet = clean(leadAddress.street);
  const streetDisplay = street || (hcpStreet && hcpStreet !== zip ? hcpStreet : "");
  return { streetDisplay, city, state, zip };
}

function isZip(value) {
  return /^\d{5}(?:-\d{4})?$/.test(value);
}

function addressLine(parts) {
  const locality = [parts.city, parts.state].filter(Boolean).join(" ");
  return [parts.streetDisplay, locality, parts.zip].filter(Boolean).join(", ") || "Not provided";
}

export function campaignFields(body) {
  const source = body && typeof body === "object" ? body : {};
  const found = {};
  for (const key of TRACKING_KEYS) {
    const direct = clean(source[key]);
    if (direct) found[key] = direct;
  }
  const pageUrl = clean(source.pageUrl);
  if (!pageUrl) return found;
  try {
    const url = new URL(pageUrl);
    for (const key of TRACKING_KEYS) {
      if (found[key]) continue;
      const value = url.searchParams.get(key);
      if (value && value.trim()) found[key] = value.trim();
    }
  } catch {
    // The page URL is still included on its own line.
  }
  return found;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    return null;
  }
  return null;
}

export function buildLeadAlert({ body = {}, lead = {}, saved = true, leadId = null, failure = "", now = new Date() } = {}) {
  const customer = lead && lead.customer ? lead.customer : {};
  const leadAddress = Array.isArray(customer.addresses) ? customer.addresses[0] || {} : {};
  const parts = addressParts(body, leadAddress);
  const firstName = firstNameOf(body, customer);
  const place = parts.city || parts.zip || "unknown";
  const subject = saved
    ? `New handyman lead: ${firstName} (${place})`
    : `LEAD NOT SAVED IN HCP: ${firstName} (${place})`;
  const national = normalizeUsPhone(customer.mobile_number) || normalizeUsPhone(body.phone);
  const phoneDisplay = national ? formatPhone(national) : clean(body.phone) || "Not provided";
  const phoneTel = national ? `tel:+1${national}` : "";
  const email = clean(customer.email) || clean(body.email) || "Not provided";
  const job = clean(body.projectList) || clean(body.message) || clean(body.comments) || "Not provided";
  const notes = clean(customer.notes) || clean(body.notes) || "Not provided";
  const pageUrl = clean(body.pageUrl) || "Not provided";
  const leadSource = clean(lead.lead_source) || HANDYMAN_LEAD_SOURCE;
  const hcpId = leadId ? String(leadId) : "Not saved";
  const when = formatDenverTime(now);
  const tracking = campaignFields(body);
  const reason = clean(failure) || "Housecall Pro did not save this lead.";
  const statusText = saved
    ? "Saved in Housecall Pro: Yes"
    : `Saved in Housecall Pro: No\nReason: ${reason}`;

  const text = [
    statusText,
    `Time: ${when}`,
    "",
    `Name: ${displayName(body, customer)}`,
    `Phone: ${phoneDisplay}`,
    phoneTel ? `Phone link: ${phoneTel}` : null,
    `Email: ${email}`,
    `Address: ${addressLine(parts)}`,
    `Job requested: ${job}`,
    `Lead source: ${leadSource}`,
    `Page URL: ${pageUrl}`,
    `HCP lead id: ${hcpId}`,
    "",
    "UTM / click ids",
    ...TRACKING_KEYS.map((key) => `${key}: ${tracking[key] || "Not provided"}`),
    "",
    "Notes:",
    notes
  ].filter((line) => line != null).join("\n");

  const pageHref = safeHttpUrl(pageUrl);
  const pageHtml = pageHref
    ? `<a href="${escapeHtml(pageHref)}">${escapeHtml(pageUrl)}</a>`
    : escapeHtml(pageUrl);
  const phoneHtml = phoneTel
    ? `<a href="${escapeHtml(phoneTel)}">${escapeHtml(phoneDisplay)}</a>`
    : escapeHtml(phoneDisplay);

  const html = [
    "<!DOCTYPE html><html><body>",
    `<p>${textToHtml(statusText)}</p>`,
    `<p><strong>Time:</strong> ${escapeHtml(when)}</p>`,
    `<p><strong>Name:</strong> ${escapeHtml(displayName(body, customer))}</p>`,
    `<p><strong>Phone:</strong> ${phoneHtml}</p>`,
    `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
    `<p><strong>Address:</strong> ${escapeHtml(addressLine(parts))}</p>`,
    `<p><strong>Job requested:</strong> ${escapeHtml(job)}</p>`,
    `<p><strong>Lead source:</strong> ${escapeHtml(leadSource)}</p>`,
    `<p><strong>Page URL:</strong> ${pageHtml}</p>`,
    `<p><strong>HCP lead id:</strong> ${escapeHtml(hcpId)}</p>`,
    "<h2>UTM / click ids</h2><ul>",
    ...TRACKING_KEYS.map((key) => `<li>${escapeHtml(key)}: ${escapeHtml(tracking[key] || "Not provided")}</li>`),
    "</ul><h2>Notes</h2>",
    `<p>${textToHtml(notes)}</p>`,
    "</body></html>"
  ].join("");

  return { subject, text, html };
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("Lead alert timed out.");
      error.code = "LEAD_ALERT_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });
  // If the timeout wins, a later SMTP rejection must not surface as unhandled.
  promise.catch(() => {});
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function createSmtpTransport(smtp, timeoutMs) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: smtp.user,
      pass: smtp.pass
    },
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs
  });
}

function logAlertFailure(error) {
  console.error("LEAD ALERT FAILED:", {
    code: error && error.code ? error.code : "LEAD_ALERT_ERROR"
  });
}

export async function deliverLeadAlert(input, options = {}) {
  const env = options.env || process.env;
  const timeoutMs = options.timeoutMs ?? LEAD_ALERT_TIMEOUT_MS;
  const transport = options.transport || injectedTransport;
  if (env.NODE_ENV === "test" && !transport) return { ok: false, skipped: true };

  const smtp = readSmtp(env);
  if (!smtp) {
    logAlertFailure({ code: "MISSING_SMTP_ENV" });
    return { ok: false, skipped: false };
  }

  const alert = buildLeadAlert(input);
  const message = {
    from: `Good Life Website <${smtp.user}>`,
    to: smtp.to.join(", "),
    subject: alert.subject,
    text: alert.text,
    html: alert.html
  };

  let created = null;
  const active = transport || (created = createSmtpTransport(smtp, timeoutMs));
  try {
    const pending = Promise.resolve().then(() => active.sendMail(message));
    await withTimeout(pending, timeoutMs);
    console.log("LEAD ALERT SENT:", {
      leadId: input && input.leadId ? String(input.leadId) : null,
      saved: !(input && input.saved === false)
    });
    return { ok: true };
  } catch (error) {
    logAlertFailure(error);
    return { ok: false };
  } finally {
    if (created && typeof created.close === "function") created.close();
  }
}
