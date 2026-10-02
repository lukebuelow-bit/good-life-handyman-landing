import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bindPhoneTapTracking } from './phone-tap.js';

function element(tag, attrs = {}, children = []) {
  const node = {
    tagName: tag.toUpperCase(),
    attrs,
    children,
    parentElement: null,
    listeners: {},
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    matches(selector) {
      if (selector !== 'a[href^="tel:"]') return false;
      const href = this.getAttribute('href');
      return this.tagName === 'A' && typeof href === 'string' && href.startsWith('tel:');
    },
    closest(selector) {
      let current = this;
      while (current) {
        if (current.matches(selector)) return current;
        current = current.parentElement;
      }
      return null;
    },
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((listener) => listener !== fn);
    },
    dispatchEvent(event) {
      event.target ||= this;
      let current = event.target;
      while (current) {
        for (const listener of [...(current.listeners[event.type] || [])]) listener(event);
        current = current.parentElement;
      }
      return !event.defaultPrevented;
    }
  };
  for (const child of children) child.parentElement = node;
  return node;
}

function click(target) {
  return {
    type: 'click',
    target,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
}

function installWindow() {
  const calls = { fbq: [], clarity: [], va: [] };
  globalThis.window = {
    fbq: (...args) => calls.fbq.push(args),
    clarity: (...args) => calls.clarity.push(args),
    va: (...args) => calls.va.push(args)
  };
  return calls;
}

test('a tel: tap fires Contact, Clarity, and Vercel without blocking the call', () => {
  const calls = installWindow();
  const icon = element('svg');
  const header = element('a', { href: 'tel:+19706106200' }, [icon]);
  const footer = element('a', { href: 'tel:+19706106200' }, [element('span')]);
  const sticky = element('a', { href: '#qualification' });
  const page = element('div', {}, [header, footer, sticky]);
  const unbind = bindPhoneTapTracking(page);

  const headerClick = click(icon);
  assert.equal(page.dispatchEvent(headerClick), true);
  assert.equal(headerClick.defaultPrevented, false);
  assert.equal(header.getAttribute('href'), 'tel:+19706106200');

  const footerClick = click(footer);
  page.dispatchEvent(footerClick);
  assert.equal(footerClick.defaultPrevented, false);

  const stickyClick = click(sticky);
  page.dispatchEvent(stickyClick);
  assert.equal(stickyClick.defaultPrevented, false);

  assert.equal(calls.fbq.length, 2);
  assert.deepEqual(calls.fbq[0], [
    'track',
    'Contact',
    { content_name: 'phone_tap', content_category: 'handyman' }
  ]);
  assert.deepEqual(calls.fbq[1], calls.fbq[0]);
  assert.deepEqual(calls.clarity, [
    ['event', 'phone_tap'],
    ['event', 'phone_tap']
  ]);
  assert.equal(calls.va.length, 2);
  assert.equal(calls.va[0][0], 'event');
  assert.equal(calls.va[0][1].name, 'phone_tap');
  assert.equal(calls.clarity.length, 2);
  assert.equal(stickyClick.defaultPrevented, false);

  unbind();
  const after = click(header);
  page.dispatchEvent(after);
  assert.equal(calls.fbq.length, 2);
  assert.equal(after.defaultPrevented, false);
  delete globalThis.window;
});

test('missing fbq and clarity do not throw or cancel the tel: link', () => {
  globalThis.window = { va: () => {} };
  const link = element('a', { href: 'tel:+19706106200' });
  const page = element('div', {}, [link]);
  const unbind = bindPhoneTapTracking(page);
  const event = click(link);
  assert.doesNotThrow(() => page.dispatchEvent(event));
  assert.equal(event.defaultPrevented, false);
  assert.equal(link.getAttribute('href'), 'tel:+19706106200');
  unbind();
  delete globalThis.window;
});

test('a throwing pixel still leaves the phone link navigable', () => {
  globalThis.window = {
    fbq: () => {
      throw new Error('pixel down');
    },
    clarity: () => {
      throw new Error('clarity down');
    },
    va: () => {}
  };
  const link = element('a', { href: 'tel:+19706106200' });
  const page = element('div', {}, [link]);
  const unbind = bindPhoneTapTracking(page);
  const event = click(link);
  assert.doesNotThrow(() => page.dispatchEvent(event));
  assert.equal(event.defaultPrevented, false);
  unbind();
  delete globalThis.window;
});

test('the landing page delegates phone taps and keeps the Meta pixel', () => {
  const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(app, /bindPhoneTapTracking\(\)/);
  assert.match(app, /href="tel:\+19706106200"/);
  assert.match(html, /fbq\('init','2554951171672190'\)/);
});
