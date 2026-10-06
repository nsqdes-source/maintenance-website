"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  loaded?: boolean;
  version?: string;
  push?: Fbq;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
    __mueenAdvertisingEnabled?: boolean;
    __mueenMetaPixelId?: string;
  }
}

function ensureFbq() {
  if (window.fbq) return window.fbq;

  const fbq = ((...args: unknown[]) => {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
      return;
    }

    fbq.queue?.push(args);
  }) as Fbq;

  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];

  window.fbq = fbq;
  window._fbq = fbq;

  return fbq;
}

function loadMetaScript() {
  if (document.getElementById("meta-pixel-script")) return;

  const script = document.createElement("script");
  script.id = "meta-pixel-script";
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
}

export default function MetaPixel({ pixelId }: { pixelId?: string }) {
  const pathname = usePathname();
  const lastTrackedPath = useRef("");

  const syncPixel = useCallback(() => {
    if (!pixelId) return;

    if (window.__mueenAdvertisingEnabled !== true) {
      window.fbq?.("consent", "revoke");
      lastTrackedPath.current = "";
      return;
    }

    const fbq = ensureFbq();
    loadMetaScript();

    if (window.__mueenMetaPixelId !== pixelId) {
      fbq("init", pixelId);
      window.__mueenMetaPixelId = pixelId;
    }

    fbq("consent", "grant");

    if (lastTrackedPath.current !== pathname) {
      fbq("track", "PageView");
      lastTrackedPath.current = pathname;
    }
  }, [pathname, pixelId]);

  useEffect(() => {
    if (!pixelId) return;

    const handleConsentChange = () => syncPixel();
    const timer = window.setTimeout(syncPixel, 0);

    syncPixel();
    window.addEventListener(
      "mueen:advertising-consent-changed",
      handleConsentChange
    );

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(
        "mueen:advertising-consent-changed",
        handleConsentChange
      );
    };
  }, [pixelId, syncPixel]);

  return null;
}
