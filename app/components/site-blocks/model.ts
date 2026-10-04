export type Section = {
  id: string;
  slug: string;
  eyebrow: string | null;
  eyebrow_en: string | null;
  title: string;
  title_en: string | null;
  description: string | null;
  description_en: string | null;
  image_url: string | null;
  sort_order: number;
  is_visible: boolean;
  style_config: Record<string, unknown>;
};
export type Item = {
  id: string;
  section_id: string;
  title: string;
  title_en: string | null;
  description: string | null;
  description_en: string | null;
  image_url: string | null;
  sort_order: number;
  is_visible: boolean;
};
export type CatalogItem = {
  id: string;
  service_key: string;
  name: string;
  description: string;
  price_from: number | null;
  pricing_mode: string;
  sort_order: number;
};
export type CatalogService = {
  id: string;
  service_catalog_item_id: string;
  name: string;
  description: string;
  gross_price: number;
  sort_order: number;
};
export const LABELS: Record<string, string> = {
  hero: "الواجهة الرئيسية",
  trust: "شريط الثقة",
  services: "الخدمات",
  process: "رحلة الصيانة",
  warranty: "الضمان والمتابعة",
  faq: "الأسئلة الشائعة",
  promo: "الدعوة لطلب الخدمة",
  pricing: "التسعير",
  "service-area": "منطقة الخدمة",
  "why-us": "لماذا نحن",
  works: "الأعمال",
  contact: "التواصل",
};
export const STYLE_OPTIONS = {
  section_spacing_top: ["none", "compact", "normal", "spacious"],
  section_spacing_bottom: ["none", "compact", "normal", "spacious"],
  content_padding: ["none", "small", "medium", "large"],
  card_padding: ["small", "medium", "large"],
  item_gap: ["tight", "normal", "wide"],
  columns: ["1", "2", "3", "4"],
  alignment: ["start", "center"],
  container_width: ["narrow", "standard", "wide"],
  density: ["compact", "normal", "comfortable"],
  card_style: ["outlined", "soft", "plain"],
  image_ratio: ["square", "landscape", "portrait"],
  variant: ["default", "split", "stacked"],
  background: ["default", "white", "muted", "brand"],
  show_image: ["yes", "no"],
  show_description: ["yes", "no"],
} as const;
export type StyleKey = keyof typeof STYLE_OPTIONS;
export const STYLE_LABELS: Record<StyleKey, string> = {
  section_spacing_top: "المسافة أعلى القسم",
  section_spacing_bottom: "المسافة أسفل القسم",
  content_padding: "الهوامش الداخلية للقسم",
  card_padding: "الهوامش داخل البطاقة",
  item_gap: "المسافة بين العناصر",
  columns: "الأعمدة على الكمبيوتر",
  alignment: "محاذاة المحتوى",
  container_width: "عرض المحتوى",
  density: "كثافة المحتوى",
  card_style: "نمط البطاقة",
  image_ratio: "نسبة الصورة",
  variant: "تخطيط العرض",
  background: "خلفية القسم",
  show_image: "عرض الصور",
  show_description: "عرض وصف العناصر",
};
export const VALUE_LABELS: Record<string, string> = {
  none: "بدون",
  compact: "مضغوط",
  normal: "عادي",
  spacious: "واسع",
  small: "صغير",
  medium: "متوسط",
  large: "كبير",
  tight: "ضيقة",
  wide: "واسعة",
  narrow: "ضيق",
  standard: "قياسي",
  start: "بداية",
  center: "وسط",
  comfortable: "مريح",
  outlined: "حدود",
  soft: "ناعمة",
  plain: "بسيطة",
  square: "مربع",
  landscape: "أفقي",
  portrait: "عمودي",
  default: "افتراضي",
  split: "متجاور",
  stacked: "متتابع",
  white: "أبيض",
  muted: "هادئ",
  brand: "لون الهوية",
  yes: "نعم",
  no: "لا",
};
export const TEXT_FIELDS = [
  "cta_label",
  "secondary_cta_label",
  "panel_eyebrow",
  "panel_title",
  "panel_description",
  "panel_cta_label",
  "note",
] as const;
export function safeImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^\/(?!\/)/.test(value) && !value.includes("\\")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function sanitizeStyle(value: unknown): Record<string, unknown> {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(STYLE_OPTIONS) as StyleKey[]) {
    const v = String(input[key] ?? "");
    if ((STYLE_OPTIONS[key] as readonly string[]).includes(v)) result[key] = v;
  }
  for (const key of TEXT_FIELDS)
    for (const field of [key, `${key}_en`]) {
      if (typeof input[field] === "string")
        result[field] = (input[field] as string).slice(0, 1200);
    }
  const images = input.catalog_images;
  if (images && typeof images === "object" && !Array.isArray(images)) {
    result.catalog_images = Object.fromEntries(
      Object.entries(images)
        .filter(([id, url]) => /^[0-9a-f-]{36}$/i.test(id) && safeImage(url))
        .map(([id, url]) => [id, safeImage(url)]),
    );
  }
  return result;
}
export function ordered<T extends { id: string; sort_order: number }>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
  );
}
export function move<T extends { id: string; sort_order: number }>(
  rows: T[],
  fromId: string,
  toId: string,
): T[] {
  const sorted = ordered(rows),
    from = sorted.findIndex((row) => row.id === fromId),
    to = sorted.findIndex((row) => row.id === toId);
  if (from < 0 || to < 0 || from === to) return sorted;
  const [row] = sorted.splice(from, 1);
  sorted.splice(to, 0, row);
  return sorted.map((row, index) => ({ ...row, sort_order: index }));
}
