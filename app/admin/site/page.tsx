import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteEditor from "./SiteEditor";

export const dynamic = "force-dynamic";

export default async function SiteEditorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["maintenance_manager", "admin_manager", "super_admin"].includes(profile?.role || "")) redirect("/account");
  const [settings, sections, items] = await Promise.all([
    supabase.from("site_settings").select("key,value"),
    supabase.from("site_sections").select("id,slug,eyebrow,title,description,image_url,sort_order,is_visible").order("sort_order"),
    supabase.from("site_section_items").select("id,section_id,title,description,image_url,sort_order,is_visible").order("sort_order"),
  ]);
  return <main className="adminPage"><div className="container adminContainer">
    <div className="adminTopbar"><div><p className="eyebrow">المحتوى والهوية</p><h1>محرر الموقع</h1></div><a className="button secondary" href="/admin">العودة للإدارة</a></div>
    <SiteEditor initialSettings={Object.fromEntries((settings.data ?? []).map(row => [row.key, row.value]))} initialSections={sections.data ?? []} initialItems={items.data ?? []} />
  </div></main>;
}
