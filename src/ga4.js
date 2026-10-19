// GA4 G-1EY9KMV5RM, the same property and events as goodlifehomeco.pro (PR #40).
// The gtag snippet lives in index.html and thank-you.html. page_view is sent
// by gtag('config'). Never send names, phones, emails or addresses.
export const GA_MEASUREMENT_ID = "G-1EY9KMV5RM";

export function trackGaEvent(name, params) {
  try {
    if (typeof window === "undefined") return;
    const command = params ? ["event", name, params] : ["event", name];
    if (typeof window.gtag === "function") {
      window.gtag(...command);
      return;
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(command);
  } catch {
    // Analytics must never break the page.
  }
}

/** Successful lead form submit. */
export function trackGenerateLead({ formName, serviceType, page } = {}) {
  trackGaEvent("generate_lead", {
    form_name: formName,
    service: serviceType,
    service_type: serviceType,
    page: typeof page === "string" && page ? page : "/"
  });
}

export function trackClickToCall() {
  trackGaEvent("click_to_call", { method: "tel" });
}

export function trackClickToText() {
  trackGaEvent("click_to_text", { method: "sms" });
}

export function contactLinkKind(href) {
  const value = typeof href === "string" ? href.trim().toLowerCase() : "";
  if (value.startsWith("tel:")) return "call";
  if (value.startsWith("sms:")) return "text";
  return null;
}

/** Sitewide tel:/sms: click listener. Never cancels the click. */
export function bindGaContactClicks(target = typeof document !== "undefined" ? document : null) {
  if (!target || typeof target.addEventListener !== "function") return () => {};
  const onClick = (event) => {
    try {
      const node = event && event.target;
      const element = node && typeof node.closest === "function" ? node : node && node.parentElement;
      const link = element && typeof element.closest === "function" ? element.closest("a[href]") : null;
      if (!link) return;
      const kind = contactLinkKind(link.getAttribute("href"));
      // gtag drops commands that run inside its own click listener. Defer.
      if (kind === "call") setTimeout(trackClickToCall, 0);
      if (kind === "text") setTimeout(trackClickToText, 0);
    } catch {
      // The call or text must still go through.
    }
  };
  target.addEventListener("click", onClick, true);
  return () => target.removeEventListener("click", onClick, true);
}
