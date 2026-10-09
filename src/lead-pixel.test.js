import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  HANDYMAN_LEAD_PIXEL_PARAMS,
  UNSENT_LEAD_STORAGE_KEY,
  eventIdFromLeadPayload,
  isLeadPixelUrl,
  trackSuccessfulLead
} from './lead-pixel.js';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createWindow() {
  class HTMLImageElement {
    constructor() {
      this.complete = false;
      this.listeners = {};
      this._src = '';
    }

    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    }

    dispatch(type) {
      for (const fn of [...(this.listeners[type] || [])]) fn();
    }
  }
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: true,
    get() {
      return this._src;
    },
    set(value) {
      this._src = String(value);
    }
  });

  const store = new Map();
  const location = {
    href: 'https://handyman.goodlifehomeco.pro/'
  };
  return {
    HTMLImageElement,
    location,
    sessionStorage: {
      setItem(key, value) {
        store.set(key, String(value));
      },
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      removeItem(key) {
        store.delete(key);
      }
    },
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    fbqCalls: [],
    store
  };
}

function leadUrl(eventID) {
  return `https://www.facebook.com/tr/?id=2554951171672190&ev=Lead&eid=${encodeURIComponent(eventID)}`;
}

test('event id uses leadId when the ok body has one', () => {
  assert.equal(eventIdFromLeadPayload({ ok: true, leadId: 'lea_42' }), 'lea_42');
  assert.equal(eventIdFromLeadPayload({ leadId: '  lea_42  ' }), 'lea_42');
  assert.equal(eventIdFromLeadPayload({ leadId: 9001 }), '9001');
});

test('event id is a UUID when leadId is missing, null, or blank', () => {
  for (const payload of [null, {}, { ok: true }, { leadId: null }, { leadId: '' }, { leadId: '   ' }]) {
    const eventID = eventIdFromLeadPayload(payload);
    assert.match(eventID, /^[0-9a-f-]{36}$/i, JSON.stringify(payload));
    assert.notEqual(eventID, eventIdFromLeadPayload(payload));
  }
});

test('a finished Lead image navigates once and leaves nothing for thank-you', async () => {
  const win = createWindow();
  const eventID = 'lea_image';
  win.fbq = (command, name, data, options) => {
    win.fbqCalls.push([command, name, data, options]);
    const img = new win.HTMLImageElement();
    img.src = leadUrl(options.eventID);
    setTimeout(() => {
      img.complete = true;
      img.dispatch('load');
    }, 20);
  };

  const result = await trackSuccessfulLead(eventID, {
    win,
    startTimeoutMs: 200,
    finishTimeoutMs: 400,
    pollMs: 10
  });

  assert.equal(result.fallback, false);
  assert.equal(win.fbqCalls.length, 1);
  assert.deepEqual(win.fbqCalls[0], ['track', 'Lead', HANDYMAN_LEAD_PIXEL_PARAMS, { eventID }]);
  assert.deepEqual(HANDYMAN_LEAD_PIXEL_PARAMS, {
    content_name: 'handyman_quote',
    content_category: 'handyman'
  });
  assert.equal(win.location.href, '/thank-you.html');
  assert.equal(win.sessionStorage.getItem(UNSENT_LEAD_STORAGE_KEY), null);
});

test('a Lead that never starts is stored once for the thank-you page', async () => {
  const win = createWindow();
  const eventID = 'queued-lead';
  win.fbq = (...args) => {
    win.fbqCalls.push(args);
  };

  const result = await trackSuccessfulLead(eventID, {
    win,
    startTimeoutMs: 40,
    finishTimeoutMs: 200,
    pollMs: 10
  });

  assert.equal(result.fallback, true);
  assert.equal(win.fbqCalls.length, 1);
  assert.equal(win.location.href, '/thank-you.html');
  assert.equal(win.sessionStorage.getItem(UNSENT_LEAD_STORAGE_KEY), eventID);
});

test('an in-flight Lead is not replayed on the thank-you page', async () => {
  const win = createWindow();
  const eventID = 'lea_inflight';
  win.fbq = (command, name, data, options) => {
    win.fbqCalls.push([command, name, data, options]);
    const img = new win.HTMLImageElement();
    img.src = leadUrl(options.eventID);
  };

  const pending = trackSuccessfulLead(eventID, {
    win,
    startTimeoutMs: 30,
    finishTimeoutMs: 80,
    pollMs: 10
  });
  await delay(50);
  assert.equal(win.location.href, 'https://handyman.goodlifehomeco.pro/');
  const result = await pending;
  assert.equal(result.fallback, false);
  assert.equal(win.sessionStorage.getItem(UNSENT_LEAD_STORAGE_KEY), null);
  assert.equal(win.location.href, '/thank-you.html');
});

test('an accepted sendBeacon counts as delivered and is not stored', async () => {
  const win = createWindow();
  const eventID = 'lea_beacon';
  win.navigator = {
    sendBeacon(url, data) {
      win.beacon = { url, data };
      return true;
    }
  };
  win.fbq = (command, name, data, options) => {
    win.fbqCalls.push([command, name, data, options]);
    const body = new URLSearchParams({ ev: 'Lead', eid: options.eventID });
    win.navigator.sendBeacon('https://www.facebook.com/tr/', body);
  };

  const result = await trackSuccessfulLead(eventID, {
    win,
    startTimeoutMs: 200,
    finishTimeoutMs: 400,
    pollMs: 10
  });

  assert.equal(result.fallback, false);
  assert.equal(win.fbqCalls.length, 1);
  assert.equal(win.sessionStorage.getItem(UNSENT_LEAD_STORAGE_KEY), null);
  assert.equal(isLeadPixelUrl(leadUrl(eventID), eventID), true);
});

test('thank-you fires Lead only when the unsent id is still stored', () => {
  const html = readFileSync(new URL('../public/thank-you.html', import.meta.url), 'utf8');
  const guard = html.slice(html.indexOf("sessionStorage.getItem('gl_lead_event_id')"));
  assert.match(guard, /if\(!eventID\) return;/);
  assert.match(guard, /sessionStorage\.removeItem\('gl_lead_event_id'\);\s*fbq\('track','Lead',\{content_name:'handyman_quote',content_category:'handyman'\},\{eventID:eventID\}\);/);
  assert.equal(html.includes("fbq('track','Lead'"), true);
  const leadCalls = html.match(/fbq\('track','Lead'/g) || [];
  assert.equal(leadCalls.length, 1);
});
