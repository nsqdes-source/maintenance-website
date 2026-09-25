import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const roles = new Set(["admin_manager", "super_admin"]);

type Invoice = {
  id: string;
  invoice_number: number;
  service_request_id: string;
  customer_name: string;
  customer_email: string;
  description: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  status: string;
  created_at: string;
  issued_at: string | null;
  emailed_at: string | null;
};

type Payment = {
  invoice_id: string;
  amount: number;
  voided_at: string | null;
};

export default async function FinanceInvoicesPage() {
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

  if (!profile || !roles.has(profile.role)) {
    redirect("/admin");
  }

  const [{ data: invoices }, { data: payments }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id,invoice_number,service_request_id,customer_name,customer_email,description,subtotal,tax_amount,total,status,created_at,issued_at,emailed_at"
      )
      .order("created_at", { ascending: false })
      .limit(200),

    supabase
      .from("invoice_payments")
      .select("invoice_id,amount,voided_at"),
  ]);

  const invoiceRows = (invoices ?? []) as Invoice[];
  const paymentRows = (payments ?? []) as Payment[];

  const paidByInvoice = new Map<string, number>();

  for (const payment of paymentRows) {
    if (payment.voided_at) continue;

    paidByInvoice.set(
      payment.invoice_id,
      (paidByInvoice.get(payment.invoice_id) ?? 0) +
        Number(payment.amount)
    );
  }

  const money = (value: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
    }).format(Number(value));

  const invoiceStatus = (invoice: Invoice) => {
    if (invoice.status === "void") {
      return "ملغاة";
    }

    if (invoice.status === "draft") {
      return "مسودة";
    }

    const received = paidByInvoice.get(invoice.id) ?? 0;

    if (received >= Number(invoice.total)) {
      return "مدفوعة";
    }

    if (received > 0) {
      return "مدفوعة جزئيًا";
    }

    return "غير مدفوعة";
  };

  const issuedInvoices = invoiceRows.filter(
    (invoice) => invoice.status === "issued"
  );

  const issuedTotal = issuedInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total),
    0
  );

  const collectedTotal = issuedInvoices.reduce(
    (sum, invoice) =>
      sum + (paidByInvoice.get(invoice.id) ?? 0),
    0
  );

  const outstandingTotal = issuedTotal - collectedTotal;

  return (
    <main className="adminPage financePortal">
      <div className="container adminContainer">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">الإدارة المالية</p>
            <h1>الفواتير</h1>
          </div>

          <Link
            className="button secondary"
            href="/admin/finance"
          >
            العودة للنظرة العامة
          </Link>
        </div>

        <div className="grid">
          <section className="card">
            <p className="eyebrow">إجمالي الفواتير</p>
            <h2>{invoiceRows.length}</h2>
          </section>

          <section className="card">
            <p className="eyebrow">الفواتير الصادرة</p>
            <h2>{issuedInvoices.length}</h2>
          </section>

          <section className="card">
            <p className="eyebrow">المبلغ المتبقي</p>
            <h2>{money(outstandingTotal)}</h2>
          </section>
        </div>

        <section className="card financePanel">
          <div className="financeSectionHeader">
            <div>
              <h2>سجل الفواتير</h2>
              <p>
                جميع المسودات والفواتير الصادرة والملغاة.
              </p>
            </div>
          </div>

          {invoiceRows.length ? (
            <div className="financeTableWrap">
              <table className="financeTable">
                <thead>
                  <tr>
                    <th>رقم الفاتورة</th>
                    <th>العميل</th>
                    <th>الحالة</th>
                    <th>الإجمالي</th>
                    <th>المحصّل</th>
                    <th>المتبقي</th>
                    <th>التاريخ</th>
                    <th>الإجراء</th>
                  </tr>
                </thead>

                <tbody>
                  {invoiceRows.map((invoice) => {
                    const paid =
                      paidByInvoice.get(invoice.id) ?? 0;

                    const remaining = Math.max(
                      0,
                      Number(invoice.total) - paid
                    );

                    return (
                      <tr key={invoice.id}>
                        <td>
                          <strong>
                            #{invoice.invoice_number}
                          </strong>
                        </td>

                        <td>
                          <strong>
                            {invoice.customer_name}
                          </strong>
                          <small>
                            {invoice.customer_email || "—"}
                          </small>
                        </td>

                        <td>
                          {invoiceStatus(invoice)}
                        </td>

                        <td>
                          {money(invoice.total)}
                        </td>

                        <td>
                          {money(paid)}
                        </td>

                        <td>
                          {money(remaining)}
                        </td>

                        <td>
                          {new Date(
                            invoice.issued_at ||
                              invoice.created_at
                          ).toLocaleDateString("ar-SA")}
                        </td>

                        <td>
                          <Link
                            className="button secondary compactButton"
                            href={`/admin/finance/invoices/${invoice.id}`}
                          >
                            فتح
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p>لا توجد فواتير حتى الآن.</p>
          )}
        </section>
      </div>
    </main>
  );
}