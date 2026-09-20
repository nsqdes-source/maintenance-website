import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintInvoice from "./PrintInvoice";

export const dynamic = "force-dynamic";
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin_manager", "super_admin"].includes(profile.role)) redirect("/admin");
  const { id } = await params;
  const { data: invoice } = await supabase.from("invoices").select("invoice_number,service_request_id,customer_name,customer_email,business_name,business_address,business_email,business_tax_number,vat_registered,description,subtotal,tax_rate,tax_amount,total,status,issued_at,created_at").eq("id", id).single();
  if (!invoice) notFound();
  const money = (n: number) => new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(Number(n));
  return <main className="adminPage"><div className="container adminContainer">
    <div className="invoiceToolbar"><Link className="button secondary" href="/admin/finance">العودة للمالية</Link><PrintInvoice /></div>
    <article className="invoiceSheet" dir="rtl"><header><p className="eyebrow">{invoice.status === "draft" ? "مسودة غير صادرة" : invoice.status === "void" ? "ملغاة" : invoice.vat_registered ? "مسودة ضريبية غير صالحة للإصدار" : "مستند غير ضريبي"}</p><h1>فاتورة #{invoice.invoice_number}</h1><p>تاريخ {new Date(invoice.issued_at || invoice.created_at).toLocaleDateString("ar-SA")}</p></header>
      <div className="invoiceParties"><div><h2>من</h2><strong>{invoice.business_name}</strong><p>{invoice.business_address || "—"}</p><p>{invoice.business_email || "—"}</p>{invoice.business_tax_number ? <p>الرقم الضريبي: {invoice.business_tax_number}</p> : null}</div><div><h2>إلى</h2><strong>{invoice.customer_name}</strong><p>{invoice.customer_email}</p><p>الطلب: {invoice.service_request_id.slice(0, 8)}</p></div></div>
      <table className="financeTable"><thead><tr><th>البيان</th><th>المبلغ</th></tr></thead><tbody><tr><td>{invoice.description}</td><td>{money(invoice.subtotal)}</td></tr><tr><td>الضريبة ({invoice.tax_rate}%)</td><td>{money(invoice.tax_amount)}</td></tr><tr><th>الإجمالي</th><th>{money(invoice.total)}</th></tr></tbody></table>
      {invoice.status === "draft" ? <p className="formMessage">مسودة للمراجعة؛ لا ترسلها للعميل قبل إصدارها.</p> : null}
    </article>
  </div></main>;
}
