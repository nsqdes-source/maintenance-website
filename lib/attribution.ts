"use client";

export type Attribution = {
  landingPage: string;
  referrer: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  gclid: string;
  wbraid: string;
  gbraid: string;
  firstTouchAt: string;
};

const storageKey = "mueen:first-attribution:v1";
const trackedParams = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "wbraid", "gbraid"] as const;

declare global {
  interface Window { gtag?: (...args: unknown[]) => void; }
}

function clean(value: string | null, max = 512) { return (value || "").trim().slice(0, max); }

export function getAttribution(): Attribution {
  if (typeof window === "undefined") return { landingPage: "", referrer: "", utmSource: "", utmMedium: "", utmCampaign: "", utmContent: "", utmTerm: "", gclid: "", wbraid: "", gbraid: "", firstTouchAt: "" };
  const saved = window.sessionStorage.getItem(storageKey);
  if (saved) {
    try { return JSON.parse(saved) as Attribution; } catch { window.sessionStorage.removeItem(storageKey); }
  }
  const query = new URLSearchParams(window.location.search);
  const captured: Attribution = {
    landingPage: `${window.location.pathname}${window.location.search}`.slice(0, 2048),
    referrer: clean(document.referrer, 2048),
    utmSource: clean(query.get("utm_source"), 255), utmMedium: clean(query.get("utm_medium"), 255),
    utmCampaign: clean(query.get("utm_campaign"), 255), utmContent: clean(query.get("utm_content"), 255),
    utmTerm: clean(query.get("utm_term"), 255), gclid: clean(query.get("gclid")),
    wbraid: clean(query.get("wbraid")), gbraid: clean(query.get("gbraid")), firstTouchAt: new Date().toISOString(),
  };
  window.sessionStorage.setItem(storageKey, JSON.stringify(captured));
  return captured;
}

export function initializeAttribution() { getAttribution(); }

export function trackFunnelEvent(eventName: "view_service" | "select_service" | "start_request" | "select_issue" | "upload_photo" | "select_location" | "select_preferred_time" | "generate_lead", parameters: Record<string, string | number | boolean> = {}) {
  // Deliberately send operational labels only: never name, phone, email, address, photos, or request IDs.
  window.gtag?.("event", eventName, parameters);
}

export function hasCampaignParameters() {
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search);
  return trackedParams.some((key) => Boolean(query.get(key)));
}
