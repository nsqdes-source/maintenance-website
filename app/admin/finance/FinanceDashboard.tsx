"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DriveSyncButton from "@/app/components/DriveSyncButton";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Settings = { legal_name: string; address: string; contact_email: string; tax_number: string; tax_rate: number; vat_registered: boolean | null };
type Invoice = { id: string; invoice_number: number; service_request_id: string; customer_name: string; customer_email: string; description: string; subtotal: number; tax_amount: number; total: number; status: string; created_at: string; issued_at: string | null; emailed_at: string | null };
type Payment = { id: string; invoice_id: string; amount: number; method: string; note: string; paid_at: string; voided_at: string | null };
type Request = { id: string; customer_name: string; customer_email: string | null; service_type: string; workflow_stage: string };
export default function FinanceDashboard({ initialSettings, initialInvoices, requests, driveConnected, syncedInvoiceIds, initialPayments, summary }: { initialSettings: Settings; initialInvoices: Invoice[]; requests: Request[]; driveConnected: boolean; syncedInvoiceIds: string[]; initialPayments: Payment[]; summary: { issued_total: number; collected_total: number; outstanding_total: number } }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [requestId, setRequestId] = useState("");
  const [description, setDescription] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [busy, setBusy] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentNote, setPaymentNote] = useState("");
  const [message, setMessage] = useState("");
  const [integrationStatus, setIntegrationStatus] = useState<{ invoiceEmailConfigured: boolean; driveOAuthConfigured: boolean } | null>(null);
  useEffect(() => { void fetch("/api/admin/integrations/status").then(response => response.ok ? response.json() : null).then(setIntegrationStatus).catch(() => setIntegrationStatus(null)); }, []);
  const money = (n: number) => new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(n);
  const issued = initialInvoices.filter(i => i.status === "issued");
  const billed = Number(summary.issued_total);
  const revenue = Number(summary.collected_total);
  const paidByInvoice = new Map<string, number>();
  for (const payment of initialPayments) if (!payment.voided_at) paidByInvoice.set(payment.invoice_id, (paidByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount));
  const paymentLabel = (invoice: Invoice) => {
    if (invoice.status === "void") return "ملغاة";
    if (invoice.status !== "issued") return "مسودة";
    const received = paidByInvoice.get(invoice.id) ?? 0;
    if (received >= Number(invoice.total)) return "مدفوعة";
    if (received > 0) return "مدفوعة جزئيًا";
    return "غير مدفوعة";
  };
  async function saveSettings() {
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("finance_save_settings", { p_name: settings.legal_name, p_address: settings.address, p_email: settings.contact_email, p_tax_number: settings.tax_number, p_tax_rate: Number(settings.tax_rate), p_vat_registered: settings.vat_registered });
    setBusy(false); setMessage(error ? `تعذر حفظ المعلومات: ${error.message}` : "حُفظت معلومات المنشأة.");
  }
  async function createInvoice() {
    if (!requestId || !description.trim() || !subtotal || Number(subtotal) < 0) { setMessage("اختر طلبًا واكتب الوصف والمبلغ."); return; }
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("finance_create_invoice", { p_request_id: requestId, p_description: description, p_subtotal: Number(subtotal) });
    setBusy(false);
    if (error) setMessage(`تعذر إنشاء الفاتورة: ${error.message}`);
    else { setMessage("أُنشئت مسودة الفاتورة. راجعها قبل إصدارها."); setRequestId(""); setDescription(""); setSubtotal(""); router.refresh(); }
  }
  async function issueInvoice(id: string) {
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("finance_set_invoice_status", { p_invoice_id: id, p_status: "issued" });
    setBusy(false); setMessage(error ? `تعذر الإصدار: ${error.message}` : "أُصدرت الفاتورة. يمكنك إرسالها بالبريد الآن.");
    if (!error) router.refresh();
  }
  async function voidInvoice(id: string) {
    if (!window.confirm("إلغاء الفاتورة؟ لا يمكن إلغاء فاتورة عليها مبالغ تحصيل غير ملغاة.")) return;
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("finance_set_invoice_status", { p_invoice_id: id, p_status: "void" });
    setBusy(false); setMessage(error ? `تعذر إلغاء الفاتورة: ${error.message}` : "أُلغيت الفاتورة.");
    if (!error) router.refresh();
  }
  async function emailInvoice(id: string) {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/finance/invoices/${id}/email`, { method: "POST" });
    const result = await response.json();
    setBusy(false); setMessage(response.ok ? "أُرسلت الفاتورة بالبريد." : result.error || "تعذر إرسال الفاتورة.");
    if (response.ok) router.refresh();
  }
  async function recordPayment() {
    if (!paymentInvoiceId || !paymentAmount || Number(paymentAmount) <= 0) { setMessage("اختر فاتورة ومبلغ تحصيل صحيحًا."); return; }
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("finance_record_payment", { p_invoice_id: paymentInvoiceId, p_amount: Number(paymentAmount), p_method: paymentMethod, p_note: paymentNote });
    setBusy(false); setMessage(error ? `تعذر تسجيل التحصيل: ${error.message}` : "سُجل التحصيل.");
    if (!error) { setPaymentInvoiceId(""); setPaymentAmount(""); setPaymentNote(""); router.refresh(); }
  }
  async function voidPayment(id: string) {
    if (!window.confirm("إلغاء قيد التحصيل؟ سيبقى في السجل للمراجعة.")) return;
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("finance_void_payment", { p_payment_id: id });
    setBusy(false); setMessage(error ? `تعذر إلغاء القيد: ${error.message}` : "أُلغي قيد التحصيل.");
    if (!error) router.refresh();
  }
  return <>
    <div className="grid"><section className="card"><p className="eyebrow">الفواتير الصادرة</p><h2>{issued.length}</h2></section><section className="card"><p className="eyebrow">إجمالي الفواتير الصادرة</p><h2>{money(billed)}</h2></section><section className="card"><p className="eyebrow">المحصّل فعليًا</p><h2>{money(revenue)}</h2><p>الرصيد المتبقي: {money(Number(summary.outstanding_total))}</p></section></div>
    {message && <p role="status" className="formMessage">{message}</p>}
    <section className="card financePanel"><h2>حالة التكاملات</h2><p>لا تظهر هنا المفاتيح أو كلمات المرور؛ تعرض الصفحة حالة جاهزية الخدمة فقط.</p><p>{integrationStatus?.invoiceEmailConfigured ? "✓ إرسال الفواتير بالبريد جاهز" : "○ إرسال الفواتير يحتاج مفتاح Resend API عند النشر"}</p><p>{driveConnected ? "✓ حساب Google Drive متصل" : integrationStatus?.driveOAuthConfigured ? "○ إعداد Drive جاهز؛ اربط حساب المؤسسة" : "○ Drive يحتاج إعداد OAuth ومفاتيح البيئة"}</p></section>
    <section className="card financePanel"><h2>Google Drive</h2><p>النسخ اختياري بعد حفظ الفاتورة أو الصورة في Supabase. يحصل التطبيق على صلاحية الملفات التي ينشئها فقط.</p>{driveConnected ? <p>✓ الحساب متصل. يمكنك نسخ الفواتير الصادرة وصور الطلبات متى أردت.</p> : <a className="button secondary" href="/api/drive/connect">ربط Drive</a>}</section>
    <section className="card financePanel"><h2>معلومات المنشأة</h2><p>أدخل بيانات المنشأة قبل إصدار الفواتير. حدد حالة التسجيل الضريبي أولًا. لا يصدر النظام فواتير ضريبية حتى تكتمل متطلبات الربط مع هيئة الزكاة والضريبة والجمارك.</p>
      <div className="financeGrid">
        <label>الاسم الرسمي<input value={settings.legal_name} onChange={e => setSettings({ ...settings, legal_name: e.target.value })} /></label>
        <label>العنوان<input value={settings.address} onChange={e => setSettings({ ...settings, address: e.target.value })} /></label>
        <label>بريد التواصل<input type="email" value={settings.contact_email} onChange={e => setSettings({ ...settings, contact_email: e.target.value })} /></label>
        <label>الرقم الضريبي إن وجد<input value={settings.tax_number} onChange={e => setSettings({ ...settings, tax_number: e.target.value })} /></label>
        <label>مسجل في ضريبة القيمة المضافة؟<select value={settings.vat_registered === null ? "" : settings.vat_registered ? "yes" : "no"} onChange={e => setSettings({ ...settings, vat_registered: e.target.value === "" ? null : e.target.value === "yes", tax_rate: e.target.value === "no" ? 0 : settings.tax_rate })}><option value="">اختر الحالة</option><option value="no">غير مسجل</option><option value="yes">مسجل</option></select></label>
        <label>نسبة الضريبة %<input type="number" min="0" max="100" step="0.01" value={settings.tax_rate} disabled={!settings.vat_registered} onChange={e => setSettings({ ...settings, tax_rate: Number(e.target.value) })} /></label>
      </div><button className="button primary" type="button" disabled={busy} onClick={saveSettings}>حفظ معلومات المنشأة</button>
    </section>
    <section className="card financePanel"><h2>فاتورة جديدة</h2><p>تتوفر الطلبات المكتملة فقط. تُحفظ الفاتورة أولًا كمسودة.</p>
      <div className="financeGrid"><label>الطلب<select value={requestId} onChange={e => setRequestId(e.target.value)}><option value="">اختر طلبًا</option>{requests.map(r => <option key={r.id} value={r.id}>{r.customer_name} · {r.service_type} · {r.id.slice(0, 8)}</option>)}</select></label>
      <label>وصف الخدمة<input value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label>المبلغ قبل الضريبة (ر.س)<input type="number" min="0" step="0.01" value={subtotal} onChange={e => setSubtotal(e.target.value)} /></label></div>
      <button className="button primary" type="button" disabled={busy} onClick={createInvoice}>إنشاء مسودة</button>
    </section>
    <section className="card financePanel"><h2>تسجيل تحصيل</h2><p>سجل المبالغ التي استلمتها المؤسسة فعلًا. لا يمكن تجاوز رصيد الفاتورة.</p>
      <div className="financeGrid"><label>الفاتورة<select value={paymentInvoiceId} onChange={e => setPaymentInvoiceId(e.target.value)}><option value="">اختر فاتورة صادرة</option>{issued.filter(i => Number(i.total) > (paidByInvoice.get(i.id) ?? 0)).map(i => <option key={i.id} value={i.id}>#{i.invoice_number} · {i.customer_name} · متبقي {money(Number(i.total) - (paidByInvoice.get(i.id) ?? 0))}</option>)}</select></label>
      <label>المبلغ المحصّل<input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} /></label>
      <label>طريقة التحصيل<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="bank_transfer">تحويل بنكي</option><option value="cash">نقدًا</option><option value="card">بطاقة</option><option value="other">أخرى</option></select></label>
      <label>مرجع أو ملاحظة<input value={paymentNote} onChange={e => setPaymentNote(e.target.value)} /></label></div><button type="button" className="button primary" disabled={busy} onClick={recordPayment}>تسجيل التحصيل</button>
    </section>
    <section className="card financePanel"><h2>سجل الإيرادات المحصّلة</h2>{initialPayments.length ? <div className="financeTableWrap"><table className="financeTable"><thead><tr><th>الفاتورة</th><th>المبلغ</th><th>الطريقة</th><th>التاريخ</th><th>الحالة</th></tr></thead><tbody>{initialPayments.map(p => <tr key={p.id}><td>#{initialInvoices.find(i => i.id === p.invoice_id)?.invoice_number ?? "—"}</td><td>{money(p.amount)}</td><td>{({ bank_transfer: "تحويل", cash: "نقدًا", card: "بطاقة", other: "أخرى" } as Record<string,string>)[p.method] || p.method}</td><td>{new Date(p.paid_at).toLocaleDateString("ar-SA")}</td><td>{p.voided_at ? "ملغي" : <button disabled={busy} onClick={() => voidPayment(p.id)}>إلغاء القيد</button>}</td></tr>)}</tbody></table></div> : <p>لا توجد مبالغ محصّلة بعد.</p>}</section>
    <section className="card financePanel"><h2>الفواتير</h2><p>المسودات الضريبية للمراجعة فقط، ولا تُصدر أو تُرسل حتى تكتمل متطلبات الفوترة الإلكترونية. عند عدم التسجيل الضريبي، يمكن إصدار مستند غير ضريبي.</p>{initialInvoices.length ? <div className="financeTableWrap"><table className="financeTable"><thead><tr><th>الرقم</th><th>العميل</th><th>المبلغ</th><th>الحالة</th><th>الدفع</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>{initialInvoices.map(i => <tr key={i.id}><td><Link href={`/admin/finance/invoices/${i.id}`}>#{i.invoice_number}</Link></td><td>{i.customer_name}<small>{i.customer_email}</small></td><td>{money(i.total)}<small>المتبقي: {money(Math.max(0, Number(i.total) - (paidByInvoice.get(i.id) ?? 0)))}</small></td><td>{i.status === "issued" ? "صادرة" : i.status === "void" ? "ملغاة" : "مسودة"}</td><td>{paymentLabel(i)}</td><td>{new Date(i.created_at).toLocaleDateString("ar-SA")}</td><td>{i.status === "draft" ? <><button disabled={busy || settings.vat_registered !== false} onClick={() => issueInvoice(i.id)}>إصدار مستند غير ضريبي</button><button disabled={busy} onClick={() => voidInvoice(i.id)}>إلغاء</button></> : i.status === "issued" ? <><button disabled={busy} onClick={() => emailInvoice(i.id)}>{i.emailed_at ? "إعادة إرسال" : "إرسال بالبريد"}</button><button disabled={busy} onClick={() => voidInvoice(i.id)}>إلغاء</button></> : null}{i.status === "issued" && driveConnected ? <DriveSyncButton type="invoice" id={i.id} synced={syncedInvoiceIds.includes(i.id)} /> : null}</td></tr>)}</tbody></table></div> : <p>لا توجد فواتير بعد.</p>}</section>
  </>;
}
