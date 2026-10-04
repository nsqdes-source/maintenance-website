"use client";

import { type DragEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ImageUploadField from "./ImageUploadField";
import EditorPreview from "@/app/components/site-blocks/EditorPreview";
import { editorDefaults } from "@/app/components/site-blocks/defaults";
import {
  type Section,
  type Item,
  type CatalogItem,
  type CatalogService,
  type StyleKey,
  LABELS,
  STYLE_OPTIONS,
  STYLE_LABELS,
  VALUE_LABELS,
  TEXT_FIELDS,
  ordered,
  move,
  sanitizeStyle,
  safeImage,
} from "@/app/components/site-blocks/model";

const TEXT_LABELS: Record<string, string> = {
  cta_label: "نص زر الطلب",
  secondary_cta_label: "نص زر استعراض الخدمات",
  panel_eyebrow: "عنوان بطاقة الواجهة الفرعي",
  panel_title: "عنوان بطاقة الواجهة",
  panel_description: "وصف بطاقة الواجهة",
  panel_cta_label: "نص رابط البطاقة",
  note: "ملاحظة القسم",
};
const ITEM_SLUGS = new Set([
  "hero",
  "trust",
  "process",
  "warranty",
  "faq",
  "why-us",
  "works",
  "service-area",
]);
const isNew = (id: string) => id.startsWith("new:");
export default function SiteEditor({
  initialSettings,
  initialSections,
  initialItems,
  catalog,
  services,
}: {
  initialSettings: Record<string, string>;
  initialSections: Section[];
  initialItems: Item[];
  catalog: CatalogItem[];
  services: CatalogService[];
}) {
  const [defaults] = useState(() =>
    editorDefaults(initialSections, initialItems),
  );
  const [settings, setSettings] = useState(initialSettings);
  const [sections, setSections] = useState(defaults.sections);
  const [items, setItems] = useState(defaults.items);
  const [removed, setRemoved] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(defaults.sections[0]?.id ?? "");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">(
    "desktop",
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [drag, setDrag] = useState<{
    kind: "section" | "item";
    id: string;
    sectionId?: string;
  } | null>(null);
  const selected = sections.find((x) => x.id === selectedId) ?? sections[0];
  const sortedSections = useMemo(() => ordered(sections), [sections]);
  const selectedItems = useMemo(
    () => ordered(items.filter((x) => x.section_id === selected?.id)),
    [items, selected],
  );
  const style = sanitizeStyle(selected?.style_config);
  const patchSection = (patch: Partial<Section>) =>
    setSections((rows) =>
      rows.map((x) => (x.id === selected?.id ? { ...x, ...patch } : x)),
    );
  const patchStyle = (patch: Record<string, unknown>) =>
    patchSection({ style_config: sanitizeStyle({ ...style, ...patch }) });
  const patchItem = (id: string, patch: Partial<Item>) =>
    setItems((rows) => rows.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const reorderSections = (from: string, to: string) =>
    setSections((rows) => move(rows, from, to));
  function reorderItems(from: string, to: string) {
    if (
      !selectedItems.some((i) => i.id === from) ||
      !selectedItems.some((i) => i.id === to)
    )
      return;
    const updated = move(selectedItems, from, to);
    setItems((rows) =>
      rows.map((row) => updated.find((i) => i.id === row.id) ?? row),
    );
  }
  function startDrag(event: DragEvent, kind: "section" | "item", id: string) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDrag({ kind, id, sectionId: kind === "item" ? selected.id : undefined });
  }
  function drop(event: DragEvent, kind: "section" | "item", id: string) {
    event.preventDefault();
    event.stopPropagation();
    if (
      drag?.kind === kind &&
      (kind === "section" || drag.sectionId === selected.id)
    ) {
      if (kind === "section") reorderSections(drag.id, id);
      else reorderItems(drag.id, id);
      setMessage("تم تغيير الترتيب محليًا. اضغط حفظ التغييرات لتطبيقه.");
    }
    setDrag(null);
  }
  function addItem() {
    setItems((rows) => [
      ...rows,
      {
        id: `new:${crypto.randomUUID()}`,
        section_id: selected.id,
        title: "عنصر جديد",
        title_en: null,
        description: "",
        description_en: null,
        image_url: null,
        sort_order:
          selectedItems.reduce((n, i) => Math.max(n, i.sort_order), -1) + 1,
        is_visible: true,
      },
    ]);
  }
  function removeItem(id: string) {
    if (!isNew(id)) setRemoved((rows) => [...rows, id]);
    setItems((rows) => rows.filter((i) => i.id !== id));
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    let savedSections = [...sections],
      savedItems = [...items];
    try {
      // Existing identity settings stay on the same persistence path.
      const identityKeys = new Set([
        "logo_text",
        "logo_text_en",
        "logo_image_url",
        "header_request_cta_visible",
        "footer_request_cta_visible",
        "mobile_request_cta_visible",
        "request_cta_text",
        "header_cta_text",
        "primary_color",
        "accent_color",
        "background_color",
      ]);
      const changedSettings = Object.entries(settings)
        .filter(
          ([key, value]) =>
            identityKeys.has(key) && value !== initialSettings[key],
        )
        .map(([key, value]) => ({ key, value }));
      if (changedSettings.length) {
        const settingsResult = await supabase
          .from("site_settings")
          .upsert(changedSettings);
        if (settingsResult.error) throw settingsResult.error;
      }
      for (const section of ordered(sections)) {
        const { id, ...row } = section;
        const payload = {
          ...row,
          image_url: safeImage(row.image_url),
          style_config: sanitizeStyle(row.style_config),
        };
        const result = isNew(id)
          ? await supabase
              .from("site_sections")
              .upsert(payload, { onConflict: "slug" })
              .select("*")
              .single()
          : await supabase
              .from("site_sections")
              .update(payload)
              .eq("id", id)
              .select("*")
              .single();
        if (result.error || !result.data)
          throw result.error ?? new Error("section_save_failed");
        savedSections = savedSections.map((s) =>
          s.id === id ? result.data : s,
        );
        savedItems = savedItems.map((i) =>
          i.section_id === id ? { ...i, section_id: result.data.id } : i,
        );
        setSections([...savedSections]);
        setItems([...savedItems]);
        if (selectedId === id) setSelectedId(result.data.id);
      }
      for (const item of savedItems) {
        const { id, ...row } = item;
        const payload = { ...row, image_url: safeImage(row.image_url) };
        const result = isNew(id)
          ? await supabase
              .from("site_section_items")
              .insert(payload)
              .select("*")
              .single()
          : await supabase
              .from("site_section_items")
              .update(payload)
              .eq("id", id)
              .select("*")
              .single();
        if (result.error || !result.data)
          throw result.error ?? new Error("item_save_failed");
        savedItems = savedItems.map((i) => (i.id === id ? result.data : i));
        setItems([...savedItems]);
      }
      for (const id of removed) {
        const result = await supabase
          .from("site_section_items")
          .delete()
          .eq("id", id)
          .select("id");
        if (result.error || !result.data?.length)
          throw result.error ?? new Error("item_delete_failed");
        setRemoved((rows) => rows.filter((row) => row !== id));
      }
      const version = await supabase.from("site_editor_versions").insert({
        status: "draft",
        snapshot: { settings, sections: savedSections, items: savedItems },
      });
      if (version.error) throw version.error;
      setMessage(
        "حُفظت التغييرات في المحتوى المعروض مباشرة. سُجلت نسخة draft للأرشفة وليست مسودة معزولة.",
      );
    } catch {
      setMessage(
        "تعذر إكمال الحفظ. قد يكون بعض المحتوى حُفظ مباشرة؛ أعد المحاولة لإكمال الباقي.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!selected) return null;
  return (
    <div className="siteBuilder">
      <section className="siteBuilderToolbar">
        <div>
          <p className="eyebrow">محرر منظم وآمن</p>
          <h2>أقسام الصفحة الرئيسية</h2>
        </div>
        <div className="deviceToggle" aria-label="حجم المعاينة">
          {(["desktop", "tablet", "mobile"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={device === d}
              className={device === d ? "active" : ""}
              onClick={() => setDevice(d)}
            >
              {d === "desktop" ? "كمبيوتر" : d === "tablet" ? "تابلت" : "جوال"}
            </button>
          ))}
        </div>
        <a
          className="button secondary"
          href="/"
          target="_blank"
          rel="noreferrer"
        >
          معاينة الصفحة كاملة
        </a>
        <button
          className="button primary"
          type="button"
          disabled={busy}
          onClick={save}
        >
          {busy ? "جارٍ الحفظ..." : "حفظ التغييرات"}
        </button>
      </section>
      <p className="builderMessage">
        الحفظ يحدّث المحتوى مباشرة. الأقسام الجديدة تضاف عند أول حفظ. معاينة
        الأزرار لا ترسل طلبات.
      </p>
      <p role="status" aria-live="polite" className="builderMessage">
        {message}
      </p>
      <fieldset className="builderFieldset" disabled={busy}>
        <div className="siteBuilderGrid">
          <aside className="builderPanel blockList">
            <h3>أقسام الصفحة</h3>
            <p>اسحب المقبض، أو استخدم أزرار أعلى وأسفل ثم احفظ.</p>
            {sortedSections.map((section, index) => (
              <div
                key={section.id}
                className="builderSectionRow"
                onDragOver={(e) => {
                  if (drag?.kind === "section") e.preventDefault();
                }}
                onDrop={(e) => drop(e, "section", section.id)}
              >
                <button
                  type="button"
                  draggable
                  aria-label={`سحب قسم ${LABELS[section.slug]}`}
                  onDragStart={(e) => startDrag(e, "section", section.id)}
                  onDragEnd={() => setDrag(null)}
                >
                  ⠿
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(section.id);
                    setDrag(null);
                  }}
                  aria-pressed={selected.id === section.id}
                  className={
                    selected.id === section.id ? "blockRow active" : "blockRow"
                  }
                >
                  <span>{LABELS[section.slug] || section.slug}</span>
                  <small>
                    {section.is_visible ? "ظاهر" : "مخفي"}
                    {isNew(section.id) ? " · جديد" : ""}
                  </small>
                </button>
                <div className="builderMoveButtons">
                  <button
                    type="button"
                    aria-label={`نقل ${LABELS[section.slug]} أعلى`}
                    disabled={index === 0}
                    onClick={() =>
                      reorderSections(section.id, sortedSections[index - 1].id)
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`نقل ${LABELS[section.slug]} أسفل`}
                    disabled={index === sortedSections.length - 1}
                    onClick={() =>
                      reorderSections(section.id, sortedSections[index + 1].id)
                    }
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </aside>
          <section className="builderCanvas">
            <EditorPreview
              sections={sections}
              items={items}
              catalog={catalog}
              services={services}
              device={device}
            />
          </section>
          <aside className="builderPanel properties">
            <h3>خصائص {LABELS[selected.slug] || selected.slug}</h3>
            <label>
              <input
                type="checkbox"
                checked={selected.is_visible}
                onChange={(e) => patchSection({ is_visible: e.target.checked })}
              />{" "}
              إظهار هذا القسم
            </label>
            <label>
              العنوان الفرعي
              <input
                value={selected.eyebrow || ""}
                onChange={(e) => patchSection({ eyebrow: e.target.value })}
              />
            </label>
            <label>
              العنوان
              <input
                value={selected.title}
                onChange={(e) => patchSection({ title: e.target.value })}
              />
            </label>
            <label>
              الوصف
              <textarea
                value={selected.description || ""}
                onChange={(e) => patchSection({ description: e.target.value })}
              />
            </label>
            <ImageUploadField
              label="صورة القسم"
              value={selected.image_url}
              onChange={(url) => patchSection({ image_url: url })}
            />
            <details>
              <summary>النصوص الإنجليزية</summary>
              <label>
                English eyebrow
                <input
                  lang="en"
                  dir="ltr"
                  value={selected.eyebrow_en || ""}
                  onChange={(e) => patchSection({ eyebrow_en: e.target.value })}
                />
              </label>
              <label>
                English title
                <input
                  lang="en"
                  dir="ltr"
                  value={selected.title_en || ""}
                  onChange={(e) => patchSection({ title_en: e.target.value })}
                />
              </label>
              <label>
                English description
                <textarea
                  lang="en"
                  dir="ltr"
                  value={selected.description_en || ""}
                  onChange={(e) =>
                    patchSection({ description_en: e.target.value })
                  }
                />
              </label>
            </details>
            <details open>
              <summary>العرض والمسافات</summary>
              {(Object.keys(STYLE_OPTIONS) as StyleKey[]).map((key) => (
                <label key={key}>
                  {STYLE_LABELS[key]}
                  <select
                    aria-label={STYLE_LABELS[key]}
                    value={String(style[key] ?? "")}
                    onChange={(e) =>
                      patchStyle({ [key]: e.target.value || undefined })
                    }
                  >
                    <option value="">افتراضي القسم</option>
                    {STYLE_OPTIONS[key].map((value) => (
                      <option key={value} value={value}>
                        {VALUE_LABELS[value] ?? value}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <small>
                الأعمدة على الجوال دائمًا عمود واحد؛ التابلت بحد أقصى عمودان.
              </small>
            </details>
            <details>
              <summary>نصوص الأزرار والبطاقة</summary>
              {TEXT_FIELDS.filter(
                (key) =>
                  selected.slug === "hero" ||
                  key === "note" ||
                  (key === "cta_label" &&
                    ["services", "promo"].includes(selected.slug)),
              ).map((key) => (
                <div key={key}>
                  <label>
                    {TEXT_LABELS[key]}
                    <textarea
                      maxLength={1200}
                      value={String(style[key] ?? "")}
                      placeholder="النص الافتراضي"
                      onChange={(e) =>
                        patchStyle({ [key]: e.target.value || undefined })
                      }
                    />
                  </label>
                  <label>
                    {TEXT_LABELS[key]} — English
                    <textarea
                      maxLength={1200}
                      lang="en"
                      dir="ltr"
                      value={String(style[`${key}_en`] ?? "")}
                      onChange={(e) =>
                        patchStyle({
                          [`${key}_en`]: e.target.value || undefined,
                        })
                      }
                    />
                  </label>
                </div>
              ))}
            </details>
            {["hero", "services"].includes(selected.slug) && (
              <details>
                <summary>صور الخدمات من Catalog</summary>
                <p>
                  الاسم والهوية من Catalog؛ إعدادات العرض لا تغير بيانات الخدمات.
                </p>
                {catalog.map((row) => (
                  <div key={row.id}>
                    {selected.slug === "hero" && (
                      <label>
                        <input
                          type="checkbox"
                          checked={
                            (style.catalog_icon_visibility as
                              Record<string, boolean> | undefined)?.[row.id] !==
                            false
                          }
                          onChange={(e) =>
                            patchStyle({
                              catalog_icon_visibility: {
                                ...((style.catalog_icon_visibility as Record<
                                  string,
                                  boolean
                                >) ?? {}),
                                [row.id]: e.target.checked,
                              },
                            })
                          }
                        />
                        إظهار أيقونة {row.name}
                      </label>
                    )}
                    <ImageUploadField
                      label={row.name}
                      value={
                        (
                          style.catalog_images as
                            Record<string, string> | undefined
                        )?.[row.id] ?? null
                      }
                      onChange={(url) =>
                        patchStyle({
                          catalog_images: {
                            ...((style.catalog_images as Record<
                              string,
                              string
                            >) ?? {}),
                            [row.id]: url,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </details>
            )}
            {ITEM_SLUGS.has(selected.slug) ? (
              <details open>
                <summary>عناصر القسم</summary>
                {selectedItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="builderItem"
                    onDragOver={(e) => {
                      if (
                        drag?.kind === "item" &&
                        drag.sectionId === selected.id
                      )
                        e.preventDefault();
                    }}
                    onDrop={(e) => drop(e, "item", item.id)}
                  >
                    <div className="builderItemToolbar">
                      <button
                        type="button"
                        draggable
                        aria-label={`سحب العنصر ${item.title}`}
                        onDragStart={(e) => startDrag(e, "item", item.id)}
                        onDragEnd={() => setDrag(null)}
                      >
                        ⠿
                      </button>
                      <button
                        type="button"
                        aria-label={`نقل العنصر ${item.title} أعلى`}
                        disabled={index === 0}
                        onClick={() =>
                          reorderItems(item.id, selectedItems[index - 1].id)
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`نقل العنصر ${item.title} أسفل`}
                        disabled={index === selectedItems.length - 1}
                        onClick={() =>
                          reorderItems(item.id, selectedItems[index + 1].id)
                        }
                      >
                        ↓
                      </button>
                    </div>
                    <label>
                      {selected.slug === "faq" ? "السؤال" : "العنوان"}
                      <input
                        value={item.title}
                        onChange={(e) =>
                          patchItem(item.id, { title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      {selected.slug === "faq" ? "الإجابة" : "الوصف"}
                      <textarea
                        value={item.description || ""}
                        onChange={(e) =>
                          patchItem(item.id, { description: e.target.value })
                        }
                      />
                    </label>
                    <ImageUploadField
                      label="صورة العنصر"
                      value={item.image_url}
                      onChange={(url) => patchItem(item.id, { image_url: url })}
                    />
                    <label>
                      English title
                      <input
                        lang="en"
                        dir="ltr"
                        value={item.title_en || ""}
                        onChange={(e) =>
                          patchItem(item.id, { title_en: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      English description
                      <textarea
                        lang="en"
                        dir="ltr"
                        value={item.description_en || ""}
                        onChange={(e) =>
                          patchItem(item.id, { description_en: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.is_visible}
                        onChange={(e) =>
                          patchItem(item.id, { is_visible: e.target.checked })
                        }
                      />{" "}
                      إظهار
                    </label>
                    <button type="button" onClick={() => removeItem(item.id)}>
                      حذف عند الحفظ
                    </button>
                  </div>
                ))}
                <button
                  className="button secondary compactButton"
                  type="button"
                  onClick={addItem}
                >
                  ＋ إضافة عنصر جديد
                </button>
              </details>
            ) : (
              <p>
                الخدمات والأسعار من Catalog، ولا تُنشأ هنا بيانات تشغيلية مكررة.
              </p>
            )}
          </aside>
        </div>
      </fieldset>
      <fieldset className="builderFieldset" disabled={busy}>
        <section className="builderIdentity">
          <h3>الهوية العامة</h3>
          <label>
            اسم العلامة
            <input
              value={settings.logo_text || ""}
              onChange={(e) =>
                setSettings({ ...settings, logo_text: e.target.value })
              }
            />
          </label>
          <label>
            Brand name
            <input
              dir="ltr"
              value={settings.logo_text_en || ""}
              onChange={(e) =>
                setSettings({ ...settings, logo_text_en: e.target.value })
              }
            />
          </label>
          <ImageUploadField
            label="صورة الشعار"
            value={settings.logo_image_url || null}
            onChange={(url) =>
              setSettings({ ...settings, logo_image_url: url || "" })
            }
          />
          <label>
            <input
              type="checkbox"
              checked={settings.header_request_cta_visible !== "false"}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  header_request_cta_visible: e.target.checked
                    ? "true"
                    : "false",
                })
              }
            />{" "}
            إظهار زر طلب الخدمة في الهيدر
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.footer_request_cta_visible !== "false"}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  footer_request_cta_visible: e.target.checked
                    ? "true"
                    : "false",
                })
              }
            />{" "}
            إظهار رابط طلب الخدمة في التذييل
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.mobile_request_cta_visible !== "false"}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  mobile_request_cta_visible: e.target.checked
                    ? "true"
                    : "false",
                })
              }
            />{" "}
            إظهار زر الطلب العائم في الجوال
          </label>
          <label>
            نص زر طلب الخدمة
            <input
              value={settings.request_cta_text || "اطلب خدمة"}
              onChange={(e) =>
                setSettings({ ...settings, request_cta_text: e.target.value })
              }
            />
          </label>
          <label>
            زر تسجيل الدخول
            <input
              value={settings.header_cta_text || "تسجيل الدخول"}
              onChange={(e) =>
                setSettings({ ...settings, header_cta_text: e.target.value })
              }
            />
          </label>
          <label>
            اللون الأساسي
            <input
              type="color"
              value={settings.primary_color || "#0f172a"}
              onChange={(e) =>
                setSettings({ ...settings, primary_color: e.target.value })
              }
            />
          </label>
          <label>
            اللون المساعد
            <input
              type="color"
              value={settings.accent_color || "#14b8a6"}
              onChange={(e) =>
                setSettings({ ...settings, accent_color: e.target.value })
              }
            />
          </label>
          <label>
            لون الخلفية
            <input
              type="color"
              value={settings.background_color || "#f8fafc"}
              onChange={(e) =>
                setSettings({ ...settings, background_color: e.target.value })
              }
            />
          </label>
        </section>
      </fieldset>
    </div>
  );
}
