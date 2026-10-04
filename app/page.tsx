import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { MarketingSections } from "@/app/components/MarketingSections";
import SiteFooter from "@/app/components/SiteFooter";
import ContactForm from "@/app/components/ContactForm";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const locale = await getLocale();
  const supabase = await createClient();
  // Explicit predicates keep authenticated administrators' homepage public-only too.
  const [sections, items, catalog, services] = await Promise.all([
    supabase
      .from("site_sections")
      .select("*")
      .eq("is_visible", true)
      .order("sort_order"),
    supabase
      .from("site_section_items")
      .select("*")
      .eq("is_visible", true)
      .order("sort_order"),
    supabase
      .from("service_catalog_items")
      .select(
        "id,service_key,name,description,price_from,pricing_mode,sort_order",
      )
      .eq("is_visible", true)
      .order("sort_order"),
    supabase
      .from("service_catalog_services")
      .select(
        "id,service_catalog_item_id,name,description,gross_price,sort_order",
      )
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  if (sections.error || items.error || catalog.error || services.error)
    throw new Error("تعذر تحميل محتوى الصفحة الرئيسية.");
  return (
    <main className="homeCompact">
      <MarketingSections
        sections={sections.data ?? []}
        items={items.data ?? []}
        catalog={catalog.data ?? []}
        services={services.data ?? []}
        locale={locale}
        contact={<ContactForm />}
      />
      <SiteFooter />
    </main>
  );
}
