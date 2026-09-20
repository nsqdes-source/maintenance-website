"use client";

import { createContext, useContext } from "react";
import type { Locale } from "@/lib/locale";

const LocaleContext = createContext<Locale>("ar");
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
export function useLocale() { return useContext(LocaleContext); }
export function LanguageSwitcher() {
  const locale = useLocale();
  function switchLanguage() {
    const next = locale === "ar" ? "en" : "ar";
    document.cookie = `site_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.location.reload();
  }
  return <button type="button" className="languageSwitcher" onClick={switchLanguage} aria-label={locale === "ar" ? "Switch to English" : "التبديل إلى العربية"}>
    {locale === "ar" ? "En" : "ع"}
  </button>;
}
