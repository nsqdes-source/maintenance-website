"use client";

import { useEffect } from "react";

type Snaptr = ((...args: unknown[]) => void) & {
  handleRequest?: (...args: unknown[]) => void;
};

declare global {
  interface Window {
    snaptr?: Snaptr;
    __mueenAdvertisingEnabled?: boolean;
  }
}

const storagePrefix = "mueen:snap-sign-up:v1:";

export default function SnapLeadConversion({ requestId }: { requestId: string }) {
  useEffect(() => {
    if (!requestId) return;

    const storageKey = `${storagePrefix}${requestId}`;

    function track() {
      if (window.sessionStorage.getItem(storageKey) === "sent") return true;

      if (
        window.__mueenAdvertisingEnabled !== true ||
        typeof window.snaptr?.handleRequest !== "function"
      ) {
        return false;
      }

      window.snaptr("track", "SIGN_UP");
      window.sessionStorage.setItem(storageKey, "sent");
      return true;
    }

    if (track()) return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (track() || attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 250);

    const handleConsentChange = () => {
      if (track()) {
        window.clearInterval(timer);
      }
    };

    window.addEventListener(
      "mueen:advertising-consent-changed",
      handleConsentChange
    );

    return () => {
      window.clearInterval(timer);
      window.removeEventListener(
        "mueen:advertising-consent-changed",
        handleConsentChange
      );
    };
  }, [requestId]);

  return null;
}
