import SectionBlock from "./site-blocks/SectionBlock";
import {
  ordered,
  LABELS,
  type Section,
  type Item,
  type CatalogItem,
  type CatalogService,
} from "./site-blocks/model";
import type { ReactNode } from "react";

// Shared by the public homepage and editor. Order comes only from section data.
export function MarketingSections({
  sections,
  items,
  catalog,
  services,
  locale,
  contact,
}: {
  sections: Section[];
  items: Item[];
  catalog: CatalogItem[];
  services: CatalogService[];
  locale: "ar" | "en";
  contact?: ReactNode;
}) {
  return (
    <>
      {ordered(sections)
        .filter((section) => section.is_visible && LABELS[section.slug])
        .map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            items={items}
            catalog={catalog}
            services={services}
            locale={locale}
            contact={contact}
          />
        ))}
    </>
  );
}
