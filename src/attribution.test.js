import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { ATTRIBUTION_FIELDS } from '../api/attribution.js';
import { ATTRIBUTION_STORAGE_KEY, attributionBodyFields, captureAttribution } from './attribution.js';

function memoryStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(key);
    }
  };
}

function windowWith(search, stores = {}) {
  return {
    location: {
      search,
      href: `https://handyman.goodlifehomeco.pro/${search || ''}`
    },
    sessionStorage: stores.sessionStorage || memoryStorage(),
    localStorage: stores.localStorage || memoryStorage()
  };
}

const EMPTY = {
  utm_source: '',
  utm_medium: '',
  utm_campaign: '',
  utm_content: '',
  utm_term: '',
  fbclid: ''
};

test('query values are sent unchanged and missing keys stay empty', () => {
  const win = windowWith('?utm_source=Facebook&utm_medium=paid%20social&utm_campaign=Spring%202026&fbclid=IwAR0exact');
  assert.deepEqual(attributionBodyFields(win), {
    ...EMPTY,
    utm_source: 'Facebook',
    utm_medium: 'paid social',
    utm_campaign: 'Spring 2026',
    fbclid: 'IwAR0exact'
  });
  assert.equal(attributionBodyFields(win).utm_source, 'Facebook');
});

test('a landing visit saved in sessionStorage survives a URL without the query', () => {
  const landing = windowWith('?utm_source=newsletter&utm_medium=email&utm_content=hero&fbclid=click-1');
  captureAttribution(landing);

  const later = windowWith('', {
    sessionStorage: landing.sessionStorage,
    localStorage: landing.localStorage
  });
  assert.deepEqual(attributionBodyFields(later), {
    ...EMPTY,
    utm_source: 'newsletter',
    utm_medium: 'email',
    utm_content: 'hero',
    fbclid: 'click-1'
  });
});

test('localStorage is used only after the URL and sessionStorage', () => {
  const session = memoryStorage({
    [ATTRIBUTION_STORAGE_KEY]: JSON.stringify({ utm_source: 'session-source', utm_campaign: 'session-campaign' })
  });
  const local = memoryStorage({
    [ATTRIBUTION_STORAGE_KEY]: JSON.stringify({
      utm_source: 'local-source',
      utm_medium: 'local-medium',
      fbclid: 'local-click'
    })
  });
  const win = windowWith('?utm_term=from-url', { sessionStorage: session, localStorage: local });

  assert.deepEqual(attributionBodyFields(win), {
    utm_source: 'session-source',
    utm_medium: 'local-medium',
    utm_campaign: 'session-campaign',
    utm_content: '',
    utm_term: 'from-url',
    fbclid: 'local-click'
  });
});

test('an empty query does not invent utm_source', () => {
  const win = windowWith('');
  assert.deepEqual(attributionBodyFields(win), EMPTY);
  const saved = JSON.parse(win.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY) || '{}');
  assert.deepEqual(saved, {});
});

test('the quote form submits the six attribution fields from the helper', () => {
  const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
  assert.match(app, /captureAttribution\(\)/);
  assert.match(app, /\.\.\.attributionBodyFields\(\)/);
  assert.deepEqual(ATTRIBUTION_FIELDS, [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'fbclid'
  ]);
});

function sourceFiles(dir, found = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = `${dir}/${name}`;
    const stat = statSync(path);
    if (stat.isDirectory()) sourceFiles(path, found);
    else if (/\.(js|jsx|html|css)$/.test(name) && !name.endsWith('.test.js')) found.push(path);
  }
  return found;
}

test('server and client source do not default utm_source to fb, facebook, or meta', () => {
  const root = new URL('..', import.meta.url).pathname;
  const hits = [];
  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, 'utf8');
    if (/utm_source\s*[:=]\s*['"](?:fb|facebook|meta)['"]/i.test(text)) hits.push(file);
  }
  assert.deepEqual(hits, []);
});
