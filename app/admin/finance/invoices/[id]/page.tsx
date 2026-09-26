import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintInvoice from "./PrintInvoice";
import InvoiceDraftEditor from "./InvoiceDraftEditor";
import InvoiceActions from "./InvoiceActions";

export const dynamic = "force-dynamic";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin_manager", "super_admin"].includes(profile.role)) {
    redirect("/admin");
  }

  const { id } = await params;

  const [{ data: invoice }, { data: lines }, { data: payments }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id,invoice_number,service_request_id,customer_name,customer_email,customer_phone,service_type,work_summary,business_name,business_address,business_email,business_tax_number,vat_registered,description,subtotal,tax_rate,tax_amount,total,status,issued_at,created_at"
        )
        .eq("id", id)
        .single(),

      supabase
        .from("invoice_line_items")
        .select(
          "description,quantity,unit_price,warranty_days,warranty_terms,sort_order"
        )
        .eq("invoice_id", id)
        .order("sort_order"),

      supabase
        .from("invoice_payments")
        .select("id,amount,method,note,paid_at,voided_at")
        .eq("invoice_id", id)
        .order("paid_at", { ascending: true }),
    ]);

  if (!invoice) notFound();

  const money = (n: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
    }).format(Number(n));

  const activePayments = (payments ?? []).filter(
    (payment) => !payment.voided_at
  );

  const paidTotal = activePayments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0
  );

  const remaining = Math.max(Number(invoice.total) - paidTotal, 0);

  const paymentMethodLabel = (method: string) => {
    switch (method) {
      case "cash":
        return "نقدي";
      case "bank_transfer":
        return "تحويل بنكي";
      case "card":
        return "بطاقة";
      default:
        return "أخرى";
    }
  };

  return (
    <main className="adminPage">
      <div className="container adminContainer">
        <div className="invoiceToolbar">
          <Link className="button secondary" href="/admin/finance">
            العودة للمالية
          </Link>

          <PrintInvoice />

          {invoice.status === "issued" ? (
            <InvoiceActions
              invoiceId={invoice.id}
              customerEmail={invoice.customer_email || ""}
            />
          ) : null}
        </div>

        <article className="invoiceSheet" dir="rtl">
          <header>
            <p className="eyebrow">
            {invoice.status === "draft"
              ? paidTotal >= Number(invoice.total) && Number(invoice.total) > 0
                ? "مسودة غير صادرة — مدفوعة بالكامل"
                : paidTotal > 0
                  ? "مسودة غير صادرة — مدفوعة جزئيًا"
                  : "مسودة غير صادرة"
              : invoice.status === "void"
                ? "ملغاة"
                : invoice.vat_registered
                  ? "مسودة ضريبية غير صالحة للإصدار"
                  : "مستند غير ضريبي"}
            </p>

            <h1>فاتورة #{invoice.invoice_number}</h1>

            <p>
              تاريخ{" "}
              {new Date(
                invoice.issued_at || invoice.created_at
              ).toLocaleDateString("ar-SA")}
            </p>
          </header>

          <div className="invoiceParties">
            <div>
              <h2>من</h2>
              <strong>{invoice.business_name}</strong>
              <p>{invoice.business_address || "—"}</p>
              <p>{invoice.business_email || "—"}</p>

              {invoice.business_tax_number ? (
                <p>الرقم الضريبي: {invoice.business_tax_number}</p>
              ) : null}
            </div>

            <div>
              <h2>إلى</h2>
              <strong>{invoice.customer_name}</strong>
              <p>{invoice.customer_phone || "—"}</p>
              <p>{invoice.customer_email || "—"}</p>
              <p>الخدمة: {invoice.service_type || "—"}</p>
              <p>الطلب: {invoice.service_request_id.slice(0, 8)}</p>
            </div>
          </div>

          <p>
            <strong>العمل المنجز:</strong>{" "}
            {invoice.work_summary || invoice.description}
          </p>

          <table className="financeTable">
            <thead>
              <tr>
                <th>البيان</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th>الضمان</th>
                <th>الإجمالي</th>
              </tr>
            </thead>

            <tbody>
              {lines?.length ? (
                lines.map((line, index) => (
                  <tr key={index}>
                    <td>{line.description}</td>
                    <td>{line.quantity}</td>
                    <td>{money(line.unit_price)}</td>
                    <td>
                      {line.warranty_days
                        ? `${line.warranty_days} يوم${
                            line.warranty_terms
                              ? ` — ${line.warranty_terms}`
                              : ""
                          }`
                        : "غير مشمول"}
                    </td>
                    <td>
                      {money(
                        Number(line.quantity) * Number(line.unit_price)
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td>{invoice.description}</td>
                  <td>1</td>
                  <td>{money(invoice.subtotal)}</td>
                  <td>غير محدد</td>
                  <td>{money(invoice.subtotal)}</td>
                </tr>
              )}

              <tr>
                <td colSpan={4}>الضريبة ({invoice.tax_rate}%)</td>
                <td>{money(invoice.tax_amount)}</td>
              </tr>

              <tr>
                <th colSpan={4}>الإجمالي</th>
                <th>{money(invoice.total)}</th>
              </tr>

              <tr>
                <th colSpan={4}>المحصّل</th>
                <th>{money(paidTotal)}</th>
              </tr>

              <tr>
                <th colSpan={4}>المتبقي</th>
                <th>{money(remaining)}</th>
              </tr>
            </tbody>
          </table>

          {activePayments.length > 0 ? (
            <div style={{ marginTop: 24 }}>
              <h2>الدفعات والتحصيلات</h2>

              <table className="financeTable">
                <thead>
                  <tr>
                    <th>البيان</th>
                    <th>طريقة الدفع</th>
                    <th>التاريخ</th>
                    <th>المبلغ</th>
                  </tr>
                </thead>

                <tbody>
                  {activePayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.note || "دفعة على الفاتورة"}</td>
                      <td>{paymentMethodLabel(payment.method)}</td>
                      <td>
                        {new Date(payment.paid_at).toLocaleDateString("ar-SA")}
                      </td>
                      <td>{money(Number(payment.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {invoice.status === "draft" ? (
            <p className="formMessage">
              مسودة للمراجعة؛ لا ترسلها للعميل قبل إصدارها.
            </p>
          ) : null}
        </article>

        <InvoiceDraftEditor
          invoiceId={invoice.id}
          status={invoice.status}
          initialWorkSummary={invoice.work_summary || invoice.description}
          initialLines={(lines ?? []).map((line) => ({
            description: line.description,
            quantity: Number(line.quantity),
            unit_price: Number(line.unit_price),
            warranty_days: Number(line.warranty_days),
            warranty_terms: line.warranty_terms,
          }))}
        />
      </div>
    </main>
  );
}
