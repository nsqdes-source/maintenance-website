import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FinanceDashboard from "./FinanceDashboard";

export const dynamic = "force-dynamic";
const roles = new Set(["admin_manager", "super_admin"]);

export default async function FinancePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !roles.has(profile.role)) redirect("/admin");
  const [{ data: settings }, { data: invoices }, { data: requests }, { data: driveConnection }, { data: driveSyncs }, { data: payments }, { data: summary }] = await Promise.all([
    supabase.from("business_finance_settings").select("legal_name,address,contact_email,tax_number,tax_rate,vat_registered").eq("id", true).single(),
    supabase.from("invoices").select("id,invoice_number,service_request_id,customer_name,customer_email,description,subtotal,tax_amount,total,status,created_at,issued_at,emailed_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("service_requests").select("id,customer_name,customer_email,service_type,workflow_stage").eq("workflow_stage", "completed").order("created_at", { ascending: false }).limit(100),
    supabase.from("drive_connection").select("id").eq("id", true).maybeSingle(),
    supabase.from("drive_syncs").select("source_id").eq("source_type", "invoice"),
    supabase.from("invoice_payments").select("id,invoice_id,amount,method,note,paid_at,voided_at").order("paid_at", { ascending: false }).limit(300),
    supabase.rpc("finance_get_summary").single(),
  ]);
  return <main className="adminPage financePortal"><div className="container adminContainer">
    <div className="adminTopbar"><div><p className="eyebrow">الإدارة المالية</p><h1>المالية والفواتير</h1></div><Link className="button secondary" href="/admin">العودة للإدارة</Link></div>
    <FinanceDashboard initialSettings={settings ?? { legal_name: "مؤسسة أمان للمقاولات", address: "", contact_email: "", tax_number: "", tax_rate: 0, vat_registered: null }} initialInvoices={invoices ?? []} requests={requests ?? []} driveConnected={Boolean(driveConnection)} syncedInvoiceIds={(driveSyncs ?? []).map(item => item.source_id)} initialPayments={payments ?? []} summary={(summary as { issued_total: number; collected_total: number; outstanding_total: number } | null) ?? { issued_total: 0, collected_total: 0, outstanding_total: 0 }} />
  </div></main>;
}
