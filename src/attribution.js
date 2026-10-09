import { ATTRIBUTION_FIELDS } from '../api/attribution.js';

export const ATTRIBUTION_STORAGE_KEY = 'gl_attribution';

function searchParamsOf(win) {
  const search = win?.location?.search;
  const href = win?.location?.href;
  try {
    if (typeof search === 'string') return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    if (typeof href === 'string' && href) return new URL(href).searchParams;
  } catch {
    // A broken location still submits with empty attribution fields.
  }
  return new URLSearchParams();
}

function readStore(storage) {
  if (!storage || typeof storage.getItem !== 'function') return {};
  try {
    const raw = storage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const values = {};
    for (const key of ATTRIBUTION_FIELDS) {
      if (typeof parsed[key] === 'string') values[key] = parsed[key];
    }
    return values;
  } catch {
    return {};
  }
}

function writeStore(storage, values) {
  if (!storage || typeof storage.setItem !== 'function') return;
  try {
    storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Private browsing can reject storage. The current URL is still submitted.
  }
}

// Save query values from this visit so a later page without them can still
// submit the landing attribution. A new URL value replaces that key only.
export function captureAttribution(win = globalThis.window) {
  const params = searchParamsOf(win);
  const found = {};
  for (const key of ATTRIBUTION_FIELDS) {
    if (!params.has(key)) continue;
    const value = params.get(key);
    found[key] = value == null ? '' : value;
  }
  if (!Object.keys(found).length || !win) return found;
  writeStore(win.sessionStorage, { ...readStore(win.sessionStorage), ...found });
  writeStore(win.localStorage, { ...readStore(win.localStorage), ...found });
  return found;
}

// Current query string, then this session's landing visit, then localStorage.
// Missing keys are empty strings. Values are not rewritten or defaulted.
export function attributionBodyFields(win = globalThis.window) {
  captureAttribution(win);
  const params = searchParamsOf(win);
  const session = readStore(win?.sessionStorage);
  const local = readStore(win?.localStorage);
  const fields = {};
  for (const key of ATTRIBUTION_FIELDS) {
    if (params.has(key)) {
      const value = params.get(key);
      fields[key] = value == null ? '' : value;
    } else if (Object.prototype.hasOwnProperty.call(session, key)) {
      fields[key] = session[key];
    } else if (Object.prototype.hasOwnProperty.call(local, key)) {
      fields[key] = local[key];
    } else {
      fields[key] = '';
    }
  }
  return fields;
}
