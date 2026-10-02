import { track } from '@vercel/analytics';

const TEL_SELECTOR = 'a[href^="tel:"]';

function callIfFunction(fn, args) {
  if (typeof fn !== 'function') return;
  try {
    fn(...args);
  } catch {
    // A tracker failure must not cancel the phone call.
  }
}

// One path for every tel: link. Never cancels the click, so the dialer still opens.
export function trackPhoneTap(event) {
  const link = event?.target?.closest?.(TEL_SELECTOR);
  if (!link) return false;

  const win = globalThis.window;
  callIfFunction(win?.fbq, [
    'track',
    'Contact',
    { content_name: 'phone_tap', content_category: 'handyman' }
  ]);
  callIfFunction(win?.clarity, ['event', 'phone_tap']);
  if (win) {
    try {
      track('phone_tap');
    } catch {
      // track() can throw outside the browser. The call still proceeds.
    }
  }
  return true;
}

export function bindPhoneTapTracking(target = globalThis.document) {
  if (!target?.addEventListener) return () => {};
  const onClick = (event) => {
    trackPhoneTap(event);
  };
  target.addEventListener('click', onClick);
  return () => target.removeEventListener('click', onClick);
}
