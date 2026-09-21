import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContactInbox from "./ContactInbox";

export const dynamic = "force-dynamic";
const roles = new Set(["maintenance_manager", "admin_manager", "super_admin"]);

export default async function ContactInboxPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !roles.has(profile.role)) redirect("/account");
  const { data: messages } = await supabase.from("contact_messages").select("id,name,phone,email,subject,message,status,created_at").order("created_at", { ascending: false }).limit(200);
  return <main className="adminPage"><div className="container adminContainer"><div className="adminTopbar"><div><p className="eyebrow">التواصل</p><h1>رسائل الموقع</h1></div></div><ContactInbox messages={messages ?? []} /></div></main>;
}
