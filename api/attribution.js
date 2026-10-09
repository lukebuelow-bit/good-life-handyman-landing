// Query values copied onto the Housecall Pro lead. Body fields win when they
// are non-empty. Otherwise the same key is read from pageUrl. Nothing here
// invents a source such as "fb".

export const ATTRIBUTION_FIELDS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid"
];

function pageParams(pageUrl) {
  if (typeof pageUrl !== "string" || !pageUrl.trim()) return null;
  try {
    return new URL(pageUrl, "https://handyman.goodlifehomeco.pro").searchParams;
  } catch {
    return null;
  }
}

export function attributionFromPageUrl(pageUrl) {
  const params = pageParams(pageUrl);
  const values = {};
  for (const key of ATTRIBUTION_FIELDS) {
    if (!params || !params.has(key)) {
      values[key] = "";
      continue;
    }
    const value = params.get(key);
    values[key] = value == null ? "" : value;
  }
  return values;
}

export function resolveAttribution(body, pageUrl) {
  const source = body && typeof body === "object" ? body : {};
  const fromUrl = attributionFromPageUrl(pageUrl);
  const values = {};
  for (const key of ATTRIBUTION_FIELDS) {
    const raw = source[key];
    values[key] = typeof raw === "string" && raw.length > 0 ? raw : fromUrl[key];
  }
  return values;
}
