import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteEditor from "./SiteEditor";

export const dynamic = "force-dynamic";

export default async function SiteEditorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "super_admin") redirect("/admin");
  const [settings, sections, items, catalog, services] = await Promise.all([
    supabase.from("site_settings").select("key,value"),
    supabase
      .from("site_sections")
      .select(
        "id,slug,eyebrow,eyebrow_en,title,title_en,description,description_en,image_url,sort_order,is_visible,style_config",
      )
      .order("sort_order"),
    supabase
      .from("site_section_items")
      .select(
        "id,section_id,title,title_en,description,description_en,image_url,sort_order,is_visible",
      )
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
  if (
    settings.error ||
    sections.error ||
    items.error ||
    catalog.error ||
    services.error
  )
    throw new Error("تعذر تحميل بيانات محرر الموقع.");
  return (
    <main className="adminPage">
      <div className="container adminContainer">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">المحتوى والهوية</p>
            <h1>محرر الموقع</h1>
          </div>
          <a className="button secondary" href="/admin">
            العودة للإدارة
          </a>
        </div>
        <SiteEditor
          initialSettings={Object.fromEntries(
            (settings.data ?? []).map((row) => [row.key, row.value]),
          )}
          initialSections={sections.data ?? []}
          initialItems={items.data ?? []}
          catalog={catalog.data ?? []}
          services={services.data ?? []}
        />
      </div>
    </main>
  );
}
