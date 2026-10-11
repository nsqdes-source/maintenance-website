"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type Snaptr = ((...args: unknown[]) => void) & {
  handleRequest?: (...args: unknown[]) => void;
  queue?: unknown[][];
};

declare global {
  interface Window {
    snaptr?: (...args: unknown[]) => void;
    __mueenAdvertisingEnabled?: boolean;
    __mueenSnapPixelId?: string;
  }
}

function ensureSnaptr() {
  if (window.snaptr) return window.snaptr as Snaptr;

  const snaptr = ((...args: unknown[]) => {
    if (snaptr.handleRequest) {
      snaptr.handleRequest(...args);
      return;
    }

    snaptr.queue?.push(args);
  }) as Snaptr;

  snaptr.queue = [];
  window.snaptr = snaptr;

  return snaptr;
}

function loadSnapScript() {
  if (document.getElementById("snap-pixel-script")) return;

  const script = document.createElement("script");
  script.id = "snap-pixel-script";
  script.async = true;
  script.src = "https://sc-static.net/scevent.min.js";
  document.head.appendChild(script);
}

export default function SnapPixel({ pixelId }: { pixelId?: string }) {
  const pathname = usePathname();
  const lastTrackedPath = useRef("");

  const syncPixel = useCallback(() => {
    if (!pixelId) return;

    if (window.__mueenAdvertisingEnabled !== true) {
      lastTrackedPath.current = "";
      return;
    }

    const snaptr = ensureSnaptr();
    loadSnapScript();

    if (window.__mueenSnapPixelId !== pixelId) {
      snaptr("init", pixelId, {});
      window.__mueenSnapPixelId = pixelId;
    }

    if (lastTrackedPath.current !== pathname) {
      snaptr("track", "PAGE_VIEW");
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
