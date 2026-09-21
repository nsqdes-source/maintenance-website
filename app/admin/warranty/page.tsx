import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WarrantyClaimsManager, { type WarrantyClaim } from "./WarrantyClaimsManager";

export const dynamic = "force-dynamic";
const roles = new Set(["maintenance_manager", "admin_manager", "super_admin"]);

export default async function WarrantyClaimsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !roles.has(profile.role)) redirect("/account");
  const { data } = await supabase.from("warranty_claims").select("id,description,status,admin_notes,created_at,request:service_requests(customer_name,phone,service_type),invoice:invoices(invoice_number),line:invoice_line_items(description)").order("created_at", { ascending: false }).limit(200);
  const claims: WarrantyClaim[] = (data ?? []).map((claim) => {
    const request = Array.isArray(claim.request) ? claim.request[0] : claim.request;
    const invoice = Array.isArray(claim.invoice) ? claim.invoice[0] : claim.invoice;
    const line = Array.isArray(claim.line) ? claim.line[0] : claim.line;
    return { id: claim.id, description: claim.description, status: claim.status, admin_notes: claim.admin_notes, created_at: claim.created_at, customerName: request?.customer_name || "عميل", customerPhone: request?.phone || "", serviceType: request?.service_type || "—", invoiceNumber: invoice?.invoice_number ?? null, lineDescription: line?.description || "بند ضمان عام" };
  });
  return <main className="adminPage"><div className="container adminContainer"><div className="adminTopbar"><div><p className="eyebrow">ما بعد التنفيذ</p><h1>مطالبات الضمان</h1></div></div><WarrantyClaimsManager claims={claims} /></div></main>;
}
