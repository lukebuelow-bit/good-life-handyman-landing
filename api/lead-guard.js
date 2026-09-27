// Silent bot checks and human-input limits for the Housecall Pro lead route.
// Bot signals are decided here. The route turns them into a fake success and
// does not call Housecall Pro.

export const MIN_SUBMIT_MS = 3000;

const NAME_FIELDS = ["name", "first", "last"];
const ADDRESS_FIELDS = ["address", "street", "city", "state", "zip", "cityOrZip"];
const NOTES_FIELDS = [
  "projectList",
  "notes",
  "message",
  "comments",
  "preferredDay",
  "preferredTime",
  "pageUrl"
];

const GOOD_LIFE_HOST = "goodlifehomeco.pro";

function trimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hostnameOf(url) {
  return url.hostname.toLowerCase().replace(/\.$/, "");
}

function isGoodLifeHost(hostname) {
  return hostname === GOOD_LIFE_HOST || hostname.endsWith(`.${GOOD_LIFE_HOST}`);
}

function isVercelAppHost(hostname) {
  return hostname === "vercel.app" || hostname.endsWith(".vercel.app");
}

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function isProductionEnv(env = process.env) {
  if (typeof env.VERCEL_ENV === "string" && env.VERCEL_ENV.length > 0) {
    return env.VERCEL_ENV === "production";
  }
  return env.NODE_ENV === "production";
}

// 10-digit US number. A leading 1 is allowed. Area code and exchange cannot start with 0 or 1.
export function normalizeUsPhone(value) {
  let raw = value;
  if (typeof raw === "number" && Number.isFinite(raw)) raw = String(Math.trunc(raw));
  if (typeof raw !== "string") return null;

  const digits = raw.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null;
  return national;
}

export function honeypotFilled(body) {
  if (!body || typeof body !== "object") return false;
  const value = body.company_website;
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

export function parseFormStartedAt(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

// Missing, unparseable, or under 3 seconds from load.
export function submittedTooFast(value, now = Date.now()) {
  const started = parseFormStartedAt(value);
  if (started == null) return true;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) return true;
  return nowMs - started < MIN_SUBMIT_MS;
}

export function isAllowedLeadUrl(value, { production = true } = {}) {
  if (typeof value !== "string" || !value.trim()) return false;

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }

  const hostname = hostnameOf(url);
  if (isVercelAppHost(hostname)) return false;
  if (isGoodLifeHost(hostname)) return url.protocol === "https:";
  if (!production && isLocalHostname(hostname)) {
    return url.protocol === "http:" || url.protocol === "https:";
  }
  return false;
}

// Every present Origin/Referer must be allowed, and at least one must be present.
export function hasAllowedRequestSource(origin, referer, options) {
  const values = [origin, referer].map(trimmedString).filter(Boolean);
  if (!values.length) return false;
  return values.every((value) => isAllowedLeadUrl(value, options));
}

export function fieldLengthError(body) {
  const source = body && typeof body === "object" ? body : {};
  const tooLong = (fields, max) => fields.some((field) => trimmedString(source[field]).length > max);

  if (tooLong(NAME_FIELDS, 80)) return "Name must be 80 characters or fewer.";
  if (trimmedString(source.email).length > 254) return "Email must be 254 characters or fewer.";
  if (tooLong(ADDRESS_FIELDS, 200)) return "Address fields must be 200 characters or fewer.";
  if (tooLong(NOTES_FIELDS, 2000)) return "Notes must be 2000 characters or fewer.";
  return null;
}
