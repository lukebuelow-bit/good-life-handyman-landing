// Meta's browser pixel sends a Chrome Lead as an image GET to
// https://www.facebook.com/tr/ (sendBeacon is only used for page-close
// events). That image is cancelled if we assign location.href in the same
// turn, which is why thank-you.html used to replay the same eventID and a
// Lead showed up twice whenever the first request survived.
//
// Wait until this page's Lead request finishes, then open the thank-you page
// with nothing stored. thank-you.html fires only when the request never
// started (pixel still queued). A request that already started is never
// written to sessionStorage, so the thank-you page cannot double-fire.

export const UNSENT_LEAD_STORAGE_KEY = 'gl_lead_event_id';

const DEFAULT_START_TIMEOUT_MS = 4000;
const DEFAULT_FINISH_TIMEOUT_MS = 10000;
const DEFAULT_POLL_MS = 50;

export function createEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Any ok response that shows the thank-you page gets a Lead. Prefer the
// Housecall Pro id when the body includes one; otherwise mint an id.
export function eventIdFromLeadPayload(payload) {
  const raw = payload && typeof payload === 'object' ? payload.leadId : undefined;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return createEventId();
}

export function isLeadPixelUrl(value, eventID) {
  if (!eventID || value == null) return false;
  let url;
  try {
    url = new URL(String(value), 'https://handyman.goodlifehomeco.pro');
  } catch {
    return false;
  }
  const host = url.hostname;
  if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return false;
  if (!url.pathname.includes('/tr')) return false;
  return url.searchParams.get('ev') === 'Lead' && url.searchParams.get('eid') === String(eventID);
}

function readParam(data, name) {
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      return new URLSearchParams(data).get(name);
    } catch {
      return null;
    }
  }
  if (typeof URLSearchParams !== 'undefined' && data instanceof URLSearchParams) {
    return data.get(name);
  }
  if (typeof data.get === 'function') {
    try {
      const value = data.get(name);
      return value == null ? null : String(value);
    } catch {
      return null;
    }
  }
  return null;
}

function payloadIsLead(data, eventID) {
  if (!eventID) return false;
  return readParam(data, 'ev') === 'Lead' && readParam(data, 'eid') === String(eventID);
}

function controlValue(form, name) {
  const elements = form && form.elements;
  if (elements && typeof elements.namedItem === 'function') {
    const field = elements.namedItem(name);
    if (field && typeof field.value === 'string') return field.value;
  }
  const inputs = form && typeof form.querySelectorAll === 'function'
    ? form.querySelectorAll('input')
    : [];
  for (const input of inputs) {
    if (input && input.name === name && typeof input.value === 'string') return input.value;
  }
  return null;
}

function findFrame(doc, name) {
  if (!doc || !name) return null;
  if (typeof doc.getElementById === 'function') {
    const byId = doc.getElementById(name);
    if (byId) return byId;
  }
  const frames = typeof doc.getElementsByTagName === 'function'
    ? doc.getElementsByTagName('iframe')
    : [];
  for (const frame of frames) {
    if (frame && (frame.name === name || frame.id === name)) return frame;
  }
  return null;
}

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url;
  return '';
}

function installLeadWatch(win, eventID, watch) {
  const restore = [];

  const markStarted = () => {
    watch.started = true;
  };
  const markDelivered = () => {
    watch.started = true;
    watch.delivered = true;
    if (typeof watch.onDelivered === 'function') watch.onDelivered();
  };

  const imageProto = win.HTMLImageElement && win.HTMLImageElement.prototype;
  const srcDescriptor = imageProto && Object.getOwnPropertyDescriptor(imageProto, 'src');
  if (srcDescriptor && srcDescriptor.configurable && srcDescriptor.set && srcDescriptor.get) {
    const originalSet = srcDescriptor.set;
    const originalGet = srcDescriptor.get;
    try {
      Object.defineProperty(imageProto, 'src', {
        configurable: true,
        enumerable: srcDescriptor.enumerable,
        get() {
          return originalGet.call(this);
        },
        set(value) {
          originalSet.call(this, value);
          try {
            if (!isLeadPixelUrl(value, eventID)) return;
            markStarted();
            const done = () => markDelivered();
            if (typeof this.addEventListener === 'function') {
              this.addEventListener('load', done, { once: true });
              this.addEventListener('error', done, { once: true });
            }
            if (this.complete && originalGet.call(this)) done();
          } catch {
            // A tracker failure must not break image loading.
          }
        }
      });
      restore.push(() => {
        Object.defineProperty(imageProto, 'src', srcDescriptor);
      });
    } catch {
      // Leave the native setter in place when it cannot be wrapped.
    }
  }

  if (typeof win.PerformanceObserver === 'function') {
    try {
      const observer = new win.PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (isLeadPixelUrl(entry && entry.name, eventID)) markDelivered();
        }
      });
      observer.observe({ type: 'resource', buffered: true });
      restore.push(() => observer.disconnect());
    } catch {
      // Resource timing is optional. Image and beacon hooks still work.
    }
  }

  const nav = win.navigator;
  if (nav && typeof nav.sendBeacon === 'function') {
    const originalBeacon = nav.sendBeacon.bind(nav);
    const wrappedBeacon = (url, data) => {
      const accepted = originalBeacon(url, data);
      try {
        if (accepted && (isLeadPixelUrl(url, eventID) || (String(url).includes('facebook.com/tr') && payloadIsLead(data, eventID)))) {
          markDelivered();
        }
      } catch {
        // Ignore inspection failures. The beacon already went out.
      }
      return accepted;
    };
    try {
      nav.sendBeacon = wrappedBeacon;
      restore.push(() => {
        nav.sendBeacon = originalBeacon;
      });
    } catch {
      // Some browsers expose an immutable sendBeacon.
    }
  }

  const formProto = win.HTMLFormElement && win.HTMLFormElement.prototype;
  if (formProto && typeof formProto.submit === 'function') {
    const originalSubmit = formProto.submit;
    function wrappedSubmit() {
      try {
        const action = this.action || (typeof this.getAttribute === 'function' ? this.getAttribute('action') : '') || '';
        const postsLead = String(action).includes('facebook.com/tr')
          && controlValue(this, 'ev') === 'Lead'
          && controlValue(this, 'eid') === String(eventID);
        if (postsLead) {
          markStarted();
          const doc = this.ownerDocument || win.document;
          const frame = findFrame(doc, this.target);
          if (frame && typeof frame.addEventListener === 'function') {
            frame.addEventListener('load', () => markDelivered(), { once: true });
          }
        }
      } catch {
        // Fall through to the real submit.
      }
      return originalSubmit.apply(this, arguments);
    }
    formProto.submit = wrappedSubmit;
    restore.push(() => {
      formProto.submit = originalSubmit;
    });
  }

  if (typeof win.fetch === 'function') {
    const originalFetch = win.fetch.bind(win);
    const wrappedFetch = (input, init) => {
      const result = originalFetch(input, init);
      try {
        const url = requestUrl(input);
        const body = init && init.body;
        const matched = isLeadPixelUrl(url, eventID)
          || (String(url).includes('facebook.com/tr') && payloadIsLead(body, eventID));
        if (matched) {
          markStarted();
          if (init && init.keepalive) markDelivered();
          else Promise.resolve(result).then(() => markDelivered(), () => markDelivered());
        }
      } catch {
        // Observation must not change the fetch result.
      }
      return result;
    };
    try {
      win.fetch = wrappedFetch;
      restore.push(() => {
        win.fetch = originalFetch;
      });
    } catch {
      // Ignore an immutable fetch.
    }
  }

  return function stop() {
    while (restore.length) {
      const undo = restore.pop();
      try {
        undo();
      } catch {
        // Keep restoring the remaining hooks.
      }
    }
  };
}

export function trackSuccessfulLead(eventID, options = {}) {
  const win = options.win || (typeof window !== 'undefined' ? window : undefined);
  const startTimeoutMs = options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
  const finishTimeoutMs = options.finishTimeoutMs ?? DEFAULT_FINISH_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const destination = options.destination || '/thank-you.html';

  return new Promise((resolve) => {
    const outcome = (fallback) => ({ fallback: !!fallback, eventID });
    if (!win || !win.location) {
      resolve(outcome(false));
      return;
    }

    let settled = false;
    let interval = 0;
    let arming = false;
    const watch = {
      started: false,
      delivered: false,
      onDelivered: null,
      stop() {}
    };
    const startedAt = Date.now();

    const finish = (fallback) => {
      if (settled) return;
      if (fallback && (watch.started || watch.delivered)) fallback = false;
      if (watch.delivered) fallback = false;
      settled = true;
      if (interval) win.clearInterval(interval);
      try {
        watch.stop();
      } catch {
        // Unpatching should not block the redirect.
      }
      try {
        if (fallback) win.sessionStorage.setItem(UNSENT_LEAD_STORAGE_KEY, eventID);
        else win.sessionStorage.removeItem(UNSENT_LEAD_STORAGE_KEY);
      } catch {
        // Private browsing can reject sessionStorage. Still redirect.
      }
      try {
        win.location.href = destination;
      } catch {
        // Test doubles may reject navigation.
      }
      resolve(outcome(fallback));
    };

    if (typeof win.fbq !== 'function') {
      finish(true);
      return;
    }

    watch.onDelivered = () => finish(false);
    try {
      watch.stop = installLeadWatch(win, eventID, watch);
    } catch {
      watch.stop = () => {};
    }

    try {
      win.fbq('track', 'Lead', {}, { eventID });
    } catch {
      finish(true);
      return;
    }

    if (settled) return;

    const tick = () => {
      if (settled) return;
      if (watch.delivered) {
        finish(false);
        return;
      }
      const elapsed = Date.now() - startedAt;
      if (watch.started) {
        if (elapsed >= finishTimeoutMs) finish(false);
        return;
      }
      if (elapsed < startTimeoutMs || arming) return;
      arming = true;
      win.setTimeout(() => {
        arming = false;
        if (settled || watch.started || watch.delivered) return;
        finish(true);
      }, 0);
    };

    interval = win.setInterval(tick, pollMs);
    tick();
  });
}
