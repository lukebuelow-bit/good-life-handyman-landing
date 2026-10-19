import { inject, track } from "@vercel/analytics";

export const FORM_SUBMIT_UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"];

// Vercel form_submit properties: page path, service type and only the UTM
// keys that have a value. Never names, phones, emails or addresses.
export function formSubmitProps({ page, serviceType, attribution } = {}) {
  const props = {
    page: typeof page === "string" && page ? page : "/",
    service_type: serviceType
  };
  const source = attribution && typeof attribution === "object" ? attribution : {};
  for (const key of FORM_SUBMIT_UTM_KEYS) {
    const value = typeof source[key] === "string" ? source[key].trim() : "";
    if (value) props[key] = value.slice(0, 255);
  }
  return props;
}

export function trackFormSubmit({ serviceType, attribution } = {}, send) {
  try {
    if (typeof window === "undefined") return;
    const props = formSubmitProps({
      page: window.location?.pathname,
      serviceType,
      attribution
    });
    if (send) {
      send("form_submit", props);
      return;
    }
    if (typeof window.va !== "function") inject();
    track("form_submit", props);
  } catch {
    // Analytics must never break a lead form.
  }
}
