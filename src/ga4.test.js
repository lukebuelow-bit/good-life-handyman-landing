import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { bindGaContactClicks, contactLinkKind, trackGenerateLead, GA_MEASUREMENT_ID } from "./ga4.js";

const calls = [];
function installGtag() {
  calls.length = 0;
  globalThis.window = { gtag: (...args) => calls.push(args), dataLayer: [] };
}
afterEach(() => { Reflect.deleteProperty(globalThis, "window"); });

describe("GA4", () => {
  it("uses the main site property", () => {
    assert.equal(GA_MEASUREMENT_ID, "G-1EY9KMV5RM");
  });

  it("sends generate_lead with page and service_type only", () => {
    installGtag();
    trackGenerateLead({ formName: "x", serviceType: "x", page: "/" });
    assert.deepEqual(calls, [["event", "generate_lead", { form_name: "x", service: "x", service_type: "x", page: "/" }]]);
  });

  it("classifies tel and sms links", () => {
    assert.equal(contactLinkKind("tel:+19700000000"), "call");
    assert.equal(contactLinkKind(" SMS:+19700000000"), "text");
    assert.equal(contactLinkKind("/"), null);
  });

  it("sends click_to_call and click_to_text after the click", async () => {
    installGtag();
    let handler;
    const target = { addEventListener: (_t, fn) => { handler = fn; }, removeEventListener() {} };
    bindGaContactClicks(target);
    const link = (href) => ({ getAttribute: () => href });
    const click = (href) => handler({ target: { closest: () => link(href) } });
    click("tel:+19700000000");
    click("sms:+19700000000");
    click("https://example.com");
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(calls, [
      ["event", "click_to_call", { method: "tel" }],
      ["event", "click_to_text", { method: "sms" }]
    ]);
  });
});
