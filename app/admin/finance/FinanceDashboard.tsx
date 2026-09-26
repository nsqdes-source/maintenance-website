import Link from "next/link";

type Invoice = {
  id: string;
  invoice_number: number;
  customer_name: string;
  customer_email: string;
  total: number;
  status: string;
  created_at: string;
  issued_at: string | null;
};

type Summary = {
  issued_total: number;
  collected_total: number;
  outstanding_total: number;
};

export default function FinanceDashboard({
  invoices,
  summary,
}: {
  invoices: Invoice[];
  summary: Summary;
}) {
  const money = (value: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
    }).format(Number(value));

  const statusLabel = (status: string) => {
    if (status === "issued") return "صادرة";
    if (status === "void") return "ملغاة";
    return "مسودة";
  };

  return (
    <>
      <div className="grid">
        <section className="card">
          <p className="eyebrow">إجمالي الفواتير الصادرة</p>
          <h2>{money(Number(summary.issued_total))}</h2>
        </section>

        <section className="card">
          <p className="eyebrow">المحصّل فعليًا</p>
          <h2>{money(Number(summary.collected_total))}</h2>
        </section>

        <section className="card">
          <p className="eyebrow">الرصيد المستحق</p>
          <h2>{money(Number(summary.outstanding_total))}</h2>
        </section>
      </div>

      <section className="card financePanel">
        <h2>اختصارات سريعة</h2>
        <p>الوصول المباشر إلى أقسام الإدارة المالية.</p>

        <div className="financeQuickLinks">
          <Link href="/admin/finance/invoices" className="button secondary">
            الفواتير
          </Link>

          <Link href="/admin/finance/payments" className="button secondary">
            التحصيلات
          </Link>

          <Link href="/admin/finance/expenses" className="button secondary">
            المصروفات
          </Link>

          <Link href="/admin/finance/reports" className="button secondary">
            التقارير
          </Link>

          <Link href="/admin/finance/settings" className="button secondary">
            الإعدادات المالية
          </Link>
        </div>
      </section>

      <section className="card financePanel">
        <div className="financeSectionHeader">
          <div>
            <h2>أحدث الفواتير</h2>
            <p>آخر خمس فواتير مسجلة في النظام.</p>
          </div>

          <Link
            href="/admin/finance/invoices"
            className="button secondary compactButton"
          >
            عرض كل الفواتير
          </Link>
        </div>

        {invoices.length ? (
          <div className="financeTableWrap">
            <table className="financeTable">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>العميل</th>
                  <th>الإجمالي</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                  <th>إجراء</th>
                </tr>
              </thead>

              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>#{invoice.invoice_number}</td>

                    <td>
                      {invoice.customer_name}
                      <small>{invoice.customer_email || "—"}</small>
                    </td>

                    <td>{money(Number(invoice.total))}</td>

                    <td>{statusLabel(invoice.status)}</td>

                    <td>
                      {new Date(
                        invoice.issued_at || invoice.created_at
                      ).toLocaleDateString("ar-SA")}
                    </td>

                    <td>
                      <Link
                        href={`/admin/finance/invoices/${invoice.id}`}
                        className="button secondary compactButton"
                      >
                        فتح
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>لا توجد فواتير بعد.</p>
        )}
      </section>
    </>
  );
}