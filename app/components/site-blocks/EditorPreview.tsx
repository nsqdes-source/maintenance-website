"use client";
import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MarketingSections } from "../MarketingSections";
import type { Section, Item, CatalogItem, CatalogService } from "./model";

export default function EditorPreview({
  sections,
  items,
  catalog,
  services,
  device,
}: {
  sections: Section[];
  items: Item[];
  catalog: CatalogItem[];
  services: CatalogService[];
  device: "desktop" | "tablet" | "mobile";
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  function loaded(event: SyntheticEvent<HTMLIFrameElement>) {
    const doc = event.currentTarget.contentDocument;
    if (!doc) return;
    cleanup.current?.();
    doc.documentElement.dir = "rtl";
    doc.documentElement.lang = "ar";
    const styles = [
      ...document.querySelectorAll('link[rel="stylesheet"], style'),
    ].map((node) => node.cloneNode(true));
    styles.forEach((node) => doc.head.appendChild(node));
    const preventNavigation = (event: Event) => {
      if ((event.target as HTMLElement).closest("a,button"))
        event.preventDefault();
    };
    doc.addEventListener("click", preventNavigation, true);
    cleanup.current = () => {
      styles.forEach((node) => node.parentNode?.removeChild(node));
      doc.removeEventListener("click", preventNavigation, true);
    };
    setTarget(doc.body);
  }
  return (
    <div className="builderPreviewScroll">
      <iframe
        title={`معاينة الصفحة — ${device}`}
        className={`builderPreviewFrame ${device}`}
        srcDoc='<!doctype html><html lang="ar" dir="rtl"><head></head><body></body></html>'
        onLoad={loaded}
      />
      {target &&
        createPortal(
          <main className="homeCompact builderActualPreview">
            <MarketingSections
              sections={sections}
              items={items}
              catalog={catalog}
              services={services}
              locale="ar"
              contact={
                <p>نموذج التواصل الحالي — يظهر تفاعليًا في الصفحة الفعلية.</p>
              }
            />
          </main>,
          target,
        )}
    </div>
  );
}
