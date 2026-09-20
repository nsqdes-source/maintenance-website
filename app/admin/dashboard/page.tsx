import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardDisplayEditor from "./DashboardDisplayEditor";

export const dynamic = "force-dynamic";

export default async function DashboardEditorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["maintenance_manager", "admin_manager", "super_admin"].includes(profile.role ?? "")) redirect("/account");
  const { data } = await supabase.from("dashboard_display_settings").select("customer_cards, technician_cards").eq("id", true).maybeSingle();
  return <main className="adminPage dashboardEditorPage"><div className="container adminContainer"><DashboardDisplayEditor initialCustomerCards={data?.customer_cards} initialTechnicianCards={data?.technician_cards} /></div></main>;
}
