import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const roles = new Set(["admin_manager", "super_admin"]);
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !roles.has(profile.role)) return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  const { id } = await params;
  const { data: invoice } = await supabase.from("invoices").select("id,invoice_number,customer_name,customer_email,business_name,business_address,business_email,business_tax_number,vat_registered,description,subtotal,tax_rate,tax_amount,total,currency,status,issued_at").eq("id", id).single();
  if (!invoice || invoice.status !== "issued") return NextResponse.json({ error: "الفاتورة غير موجودة أو لم تُصدر." }, { status: 404 });
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "إرسال الفواتير غير مهيأ بعد. أضف مفتاح Resend إلى إعدادات الخادم." }, { status: 503 });
  const from = process.env.RESEND_INVOICE_FROM || "مؤسسة أمان للمقاولات <invoices@mail.mueenfix.com>";
  const amount = (value: number) => Number(value).toFixed(2);
  const html = `<html lang="ar" dir="rtl"><body style="font-family:Arial,sans-serif;max-width:650px;margin:auto;color:#172238"><h1>فاتورة #${invoice.invoice_number}</h1><p>${escapeHtml(invoice.business_name)}</p><p>${escapeHtml(invoice.business_address)}</p><p>رقم ضريبي: ${escapeHtml(invoice.business_tax_number || "غير مسجل")}</p><hr><p>إلى: ${escapeHtml(invoice.customer_name)}</p><p>تاريخ الإصدار: ${escapeHtml(invoice.issued_at?.slice(0, 10))}</p><p>الخدمة: ${escapeHtml(invoice.description)}</p><table style="width:100%;border-collapse:collapse"><tr><td>المبلغ</td><td>${amount(invoice.subtotal)} ر.س</td></tr><tr><td>الضريبة (${amount(invoice.tax_rate)}%)</td><td>${amount(invoice.tax_amount)} ر.س</td></tr><tr><th>الإجمالي</th><th>${amount(invoice.total)} ر.س</th></tr></table><hr><p>للاستفسارات: ${escapeHtml(invoice.business_email)}</p></body></html>`;
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `invoice-${invoice.id}-${crypto.randomUUID()}` }, body: JSON.stringify({ from, to: [invoice.customer_email], subject: `فاتورة #${invoice.invoice_number} من ${invoice.business_name}`, html }) });
    if (!response.ok) { console.error("Invoice email provider error:", response.status, await response.text()); return NextResponse.json({ error: "تعذر إرسال الفاتورة. راجع إعدادات البريد وحاول مجددًا." }, { status: 502 }); }
    await supabase.rpc("finance_mark_invoice_emailed", { p_invoice_id: invoice.id });
    return NextResponse.json({ ok: true });
  } catch (error) { console.error("Invoice email error:", error); return NextResponse.json({ error: "تعذر الاتصال بخدمة البريد." }, { status: 502 }); }
}
