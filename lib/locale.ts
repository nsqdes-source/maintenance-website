import { cookies } from "next/headers";

export type Locale = "ar" | "en";
export async function getLocale(): Promise<Locale> {
  return (await cookies()).get("site_locale")?.value === "en" ? "en" : "ar";
}
export function text(locale: Locale, ar: string, en: string): string {
  return locale === "en" ? en : ar;
}
