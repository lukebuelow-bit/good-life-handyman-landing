import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { formSubmitProps, trackFormSubmit } from "./form-submit.js";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("Vercel form_submit event", () => {
  it("keeps only the UTM keys that have a value", () => {
    assert.deepEqual(
      formSubmitProps({
        page: "/",
        serviceType: "x",
        attribution: { utm_source: "google", utm_medium: "", utm_campaign: "gbp", utm_term: "t", fbclid: "f" }
      }),
      { page: "/", service_type: "x", utm_source: "google", utm_campaign: "gbp" }
    );
  });

  it("never sends contact fields", () => {
    const props = formSubmitProps({
      page: "/",
      serviceType: "x",
      attribution: { name: "A", phone: "1", email: "a@b.c", zip: "80525", address: "1 Main" }
    });
    assert.deepEqual(Object.keys(props).sort(), ["page", "service_type"]);
  });

  it("tracks form_submit with the page path", () => {
    globalThis.window = { location: { pathname: "/", search: "?utm_source=fb" } };
    const calls = [];
    trackFormSubmit({ serviceType: "x", attribution: { utm_source: "fb" } }, (...args) => calls.push(args));
    assert.deepEqual(calls, [["form_submit", { page: "/", service_type: "x", utm_source: "fb" }]]);
  });
});
