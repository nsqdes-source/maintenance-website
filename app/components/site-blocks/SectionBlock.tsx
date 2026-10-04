import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  type Section,
  type Item,
  type CatalogItem,
  type CatalogService,
  type StyleKey,
  STYLE_OPTIONS,
  ordered,
  safeImage,
  sanitizeStyle,
} from "./model";

const spacing = { none: 0, compact: 24, normal: 48, spacious: 72 };
const padding = { none: 0, small: 12, medium: 24, large: 36 };
const gaps = { tight: 8, normal: 16, wide: 28 };
const widths = { narrow: 840, standard: 1120, wide: 1320 };
export default function SectionBlock({
  section,
  items,
  catalog,
  services,
  locale = "ar",
  contact,
}: {
  section: Section;
  items: Item[];
  catalog: CatalogItem[];
  services: CatalogService[];
  locale?: "ar" | "en";
  contact?: ReactNode;
}) {
  if (!section.is_visible) return null;
  const style = sanitizeStyle(section.style_config);
  const option = (key: StyleKey, fallback: string) =>
    String(style[key] ?? fallback);
  const t = (ar: string, en: string) => (locale === "en" ? en : ar);
  const field = (
    row: Section | Item,
    key: "eyebrow" | "title" | "description",
  ) => {
    const data = row as unknown as Record<string, unknown>;
    return String(
      (locale === "en" ? (data[`${key}_en`] ?? data[key]) : data[key]) ?? "",
    );
  };
  const copy = (key: string, ar: string, en: string) =>
    String(
      (locale === "en" ? (style[`${key}_en`] ?? style[key]) : style[key]) ??
        t(ar, en),
    );
  const slug = section.slug;
  const rows = ordered(
    items.filter((i) => i.section_id === section.id && i.is_visible),
  );
  const images = (style.catalog_images ?? {}) as Record<string, string>;
  const iconVisibility = (style.catalog_icon_visibility ?? {}) as Record<
    string,
    boolean
  >;
  const cols = option(
    "columns",
    ["services", "process", "warranty", "why-us"].includes(slug) ? "4" : "2",
  );
  const css = {
    "--section-top": `${spacing[option("section_spacing_top", "normal") as keyof typeof spacing]}px`,
    "--section-bottom": `${spacing[option("section_spacing_bottom", "normal") as keyof typeof spacing]}px`,
    "--content-padding": `${padding[option("content_padding", "none") as keyof typeof padding]}px`,
    "--card-padding": `${padding[option("card_padding", "medium") as keyof typeof padding]}px`,
    "--item-gap": `${gaps[option("item_gap", "normal") as keyof typeof gaps]}px`,
    "--container-width": `${widths[option("container_width", "standard") as keyof typeof widths]}px`,
    "--mobile-columns": option("mobile_columns", "1"),
    "--hero-mobile-columns": option("mobile_columns", "2"),
    "--columns": cols,
    "--tablet-columns": String(Math.min(Number(cols), 2)),
  } as CSSProperties;
  const classes = (Object.keys(STYLE_OPTIONS) as StyleKey[])
    .filter((key) => style[key] !== undefined)
    .map((key) => `managed-${key}-${style[key]}`)
    .join(" ");
  const image = (url: unknown, className = "managedImage") =>
    safeImage(url) && option("show_image", "yes") === "yes" ? (
      <img className={className} src={safeImage(url)!} alt="" />
    ) : null;
  const heading = (
    <div className="compactSectionHeading managedHeading">
      <div>
        {field(section, "eyebrow") && (
          <p className="eyebrow">{field(section, "eyebrow")}</p>
        )}
        <h2>{field(section, "title")}</h2>
      </div>
      {field(section, "description") && <p>{field(section, "description")}</p>}
    </div>
  );
  const anchor =
    slug === "hero" ? "top" : slug === "process" ? "how-it-works" : slug;
  return (
    <section
      id={anchor}
      className={`section managedSection managed-${slug} ${slug === "hero" ? "hero" : ""} ${classes}`}
      style={css}
    >
      <div className="container managedContainer">
        {slug === "hero" ? (
          <div className="heroGrid managedHeroGrid">
            <div className="heroContent">
              <p className="eyebrow">{field(section, "eyebrow")}</p>
              <h1>{field(section, "title")}</h1>
              <p className="heroText">{field(section, "description")}</p>
              <div className="actions">
                <Link className="button primary largeButton" href="/request">
                  {copy("cta_label", "ابدأ طلب الخدمة", "Request service")}
                </Link>
                <Link className="button secondary largeButton" href="#services">
                  {copy(
                    "secondary_cta_label",
                    "استعرض خدماتنا",
                    "Explore services",
                  )}
                </Link>
              </div>
              <div className="heroTrust managedItems">
                {rows.map((row) => (
                  <span key={row.id}>
                    {image(row.image_url)}✓ {field(row, "title")}
                    {field(row, "description") && (
                      <small>{field(row, "description")}</small>
                    )}
                  </span>
                ))}
              </div>
            </div>
            <div className="heroPanel">
              {image(section.image_url, "managedHeroBackground")}
              <div className="heroPanelGlow" />
              <div className="heroPanelContent">
                <div className="managedItems heroCatalogVisuals">
                  {ordered(catalog)
                    .filter((row) => iconVisibility[row.id] !== false)
                    .map((row) => (
                      <Link href={serviceHref(row.service_key)} key={row.id}>
                        {image(images[row.id])}
                        <span>{row.name}</span>
                      </Link>
                    ))}
                </div>
                <p className="panelLabel">
                  {copy(
                    "panel_eyebrow",
                    "خدمة الصيانة تبدأ من هنا",
                    "Maintenance starts here",
                  )}
                </p>
                <h2>
                  {copy(
                    "panel_title",
                    "صف مشكلتك، واترك علينا الباقي.",
                    "Describe the issue. We will take it from there.",
                  )}
                </h2>
                <p>
                  {copy(
                    "panel_description",
                    "نستقبل تفاصيل طلبك ونرتب الخطوة التالية معك.",
                    "Share your request and we will arrange the next step.",
                  )}
                </p>
                <Link href="/request" className="panelLink">
                  {copy(
                    "panel_cta_label",
                    "إرسال طلب الخدمة ←",
                    "Send a request →",
                  )}
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            {heading}
            {image(section.image_url, "managedSectionImage")}
            {slug === "services" ? (
              <>
                <div className="managedItems">
                  {ordered(catalog).map((row) => (
                    <article
                      className="card serviceCard managedCard"
                      key={row.id}
                    >
                      {image(
                        images[row.id] ??
                          rows.find((item) => item.title === row.name)
                            ?.image_url,
                      )}
                      <div className="serviceCardBody">
                        <h3>{row.name}</h3>
                        {option("show_description", "yes") === "yes" && (
                          <p>{row.description}</p>
                        )}
                      </div>
                      <div className="serviceCardActions">
                        <Link
                          href={serviceHref(row.service_key)}
                          className="cardLink"
                        >
                          {t("تفاصيل الخدمة", "Service details")}
                        </Link>
                        <Link href="/request" className="cardLink">
                          {copy(
                            "cta_label",
                            "اطلب الخدمة ←",
                            "Request service →",
                          )}
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="sectionAction">
                  <Link className="button secondary" href="/services">
                    {t("عرض جميع الخدمات", "View all services")}
                  </Link>
                </div>
              </>
            ) : slug === "pricing" ? (
              <div className="managedItems">
                {ordered(catalog).map((category) => (
                  <article
                    className="marketingCard managedCard"
                    key={category.id}
                  >
                    <h3>{category.name}</h3>
                    {ordered(
                      services.filter(
                        (s) => s.service_catalog_item_id === category.id,
                      ),
                    ).map((service) => (
                      <div className="managedPrice" key={service.id}>
                        <strong>{service.name}</strong>
                        <span>
                          {Number(service.gross_price).toLocaleString(
                            locale === "ar" ? "ar-SA" : "en",
                            { minimumFractionDigits: 2 },
                          )}{" "}
                          {t("ر.س", "SAR")}
                        </span>
                        {option("show_description", "yes") === "yes" && (
                          <p>{service.description}</p>
                        )}
                      </div>
                    ))}
                    {!services.some(
                      (s) => s.service_catalog_item_id === category.id,
                    ) && (
                      <p>
                        {category.pricing_mode === "inspection"
                          ? t(
                              "السعر يحدد بعد المعاينة والتوضيح قبل التنفيذ.",
                              "Price is clarified after inspection and before work.",
                            )
                          : `${category.pricing_mode === "from" ? t("يبدأ من ", "From ") : ""}${category.price_from ?? 0} ${t("ر.س", "SAR")}`}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : slug === "faq" ? (
              <div className="managedItems faqList">
                {rows.map((row) => (
                  <details className="managedCard" key={row.id}>
                    <summary>{field(row, "title")}</summary>
                    {image(row.image_url)}
                    <p>{field(row, "description")}</p>
                  </details>
                ))}
              </div>
            ) : slug === "promo" ? (
              <Link className="button primary" href="/request">
                {copy(
                  "cta_label",
                  "اطلب خدمة التكييف",
                  "Request air conditioning service",
                )}
              </Link>
            ) : slug === "contact" ? (
              <div className="contactCard">{contact}</div>
            ) : (
              <div className="managedItems">
                {rows.map((row, index) => (
                  <article className="marketingCard managedCard" key={row.id}>
                    {image(row.image_url)}
                    {slug === "process" && (
                      <strong className="managedStep">
                        {String(index + 1).padStart(2, "0")}
                      </strong>
                    )}
                    <h3>{field(row, "title")}</h3>
                    {option("show_description", "yes") === "yes" &&
                      field(row, "description") && (
                        <p>{field(row, "description")}</p>
                      )}
                  </article>
                ))}
              </div>
            )}
            {copy("note", "", "") && (
              <p className="policyNote">{copy("note", "", "")}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
function serviceHref(key: string) {
  return ["ac", "plumbing", "electrical", "carpentry"].includes(key)
    ? `/services/${key}`
    : "/services";
}
