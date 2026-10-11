import Link from "next/link";

type Invoice = {
  id: string;
  invoice_number: number;
  customer_name: string;
  customer_email: string;
  total: number;
  paid: number;
  status: string;
  created_at: string;
  issued_at: string | null;
};

type CanonicalReport = {
  period: {
    issued_invoice_total: number;
    issued_invoice_count: number;
  };
  current_position: {
    gross_receipts: number;
    succeeded_refunds: number;
    net_receipts: number;
    technician_cash_custody: number;
    reserved_amount: number;
    contractual_outstanding: number;
    excess_refund_liability: number;
    review_required_count: number;
    reconciliation_required_count: number;
  };
};

export default function FinanceDashboard({
  invoices,
  report,
  currency,
  collectedIssuedCount,
}: {
  invoices: Invoice[];
  report: CanonicalReport;
  currency: string;
  collectedIssuedCount: number;
}) {
  const money = (value: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency,
    }).format(Number(value));

  const statusLabel = (invoice: Invoice) => {
    if (invoice.status === "void") return "ملغاة";

    const paid = Number(invoice.paid);
    const total = Number(invoice.total);

    if (invoice.status === "draft") {
      if (total > 0 && paid >= total) return "مسودة — مغطاة ماليًا";
      if (paid > 0) return "مسودة — مغطاة جزئيًا";
      return "مسودة";
    }

    if (invoice.status === "issued") {
      if (total > 0 && paid >= total) return "صادرة — مغطاة ماليًا";
      if (paid > 0) return "صادرة — مغطاة جزئيًا";
      return "صادرة — غير مغطاة";
    }

    return invoice.status;
  };

  const current = report.current_position;

  return (
    <>
      <div className="grid">
        <section className="card">
          <p className="eyebrow">إجمالي الفواتير الصادرة</p>
          <h2>{money(Number(report.period.issued_invoice_total))}</h2>
          <p>{report.period.issued_invoice_count} فاتورة صادرة</p>
        </section>

        <section className="card">
          <p className="eyebrow">إجمالي التحصيلات المؤكدة</p>
          <h2>{money(Number(current.gross_receipts))}</h2>
        </section>

        <section className="card">
          <p className="eyebrow">الاستردادات الناجحة</p>
          <h2>{money(Number(current.succeeded_refunds))}</h2>
        </section>

        <section className="card">
          <p className="eyebrow">صافي التحصيلات</p>
          <h2>{money(Number(current.net_receipts))}</h2>
        </section>

        <section className="card">
          <p className="eyebrow">الالتزامات غير المحصلة</p>
          <h2>{money(Number(current.contractual_outstanding))}</h2>
        </section>

        <section className="card">
          <p className="eyebrow">عهدة نقدية لدى الفنيين</p>
          <h2>{money(Number(current.technician_cash_custody))}</h2>
        </section>
      </div>

      {(Number(current.reserved_amount) > 0 ||
        Number(current.excess_refund_liability) > 0 ||
        current.review_required_count > 0 ||
        current.reconciliation_required_count > 0) ? (
        <section className="card financePanel">
          <h2>مؤشرات تتطلب متابعة مالية</h2>
          <div className="financeReportSummary">
            <div>
              <span>مبالغ محجوزة/قيد المطابقة</span>
              <strong>{money(Number(current.reserved_amount))}</strong>
            </div>
            <div>
              <span>التزام استرداد فائض</span>
              <strong>{money(Number(current.excess_refund_liability))}</strong>
            </div>
            <div>
              <span>طلبات تتطلب مراجعة</span>
              <strong>{current.review_required_count}</strong>
            </div>
            <div>
              <span>طلبات تتطلب مطابقة</span>
              <strong>{current.reconciliation_required_count}</strong>
            </div>
          </div>
        </section>
      ) : null}

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
          <Link href="/admin/finance/refunds" className="button secondary">
            الاستردادات
          </Link>
          <Link href="/admin/finance/payment-operations" className="button secondary">
            عمليات التحصيل
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
            <p>
              حالة التغطية المالية هنا تستخدم صافي ما بقي بعد الاستردادات
              الناجحة المرتبطة بالفاتورة.
            </p>
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
                    <td>{statusLabel(invoice)}</td>
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

        <p className="detailMuted">
          عدد الفواتير الصادرة المغطاة ماليًا حاليًا: {collectedIssuedCount}
        </p>
      </section>
    </>
  );
}
