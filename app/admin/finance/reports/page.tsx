import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const roles = new Set(["admin_manager", "super_admin"]);

type Expense = {
  amount: number;
  expense_date: string;
  category: string;
  voided_at: string | null;
};

type CanonicalReport = {
  currency: string | null;
  period: {
    from: string | null;
    to: string | null;
    gross_receipts: number;
    succeeded_refunds: number;
    net_receipts: number;
    expenses: number;
    net_cash_flow: number;
    issued_invoice_total: number;
    issued_invoice_count: number;
  };
  current_position: {
    technician_cash_custody: number;
    reserved_amount: number;
    contractual_outstanding: number;
    excess_refund_liability: number;
    review_required_count: number;
    reconciliation_required_count: number;
  };
};

export default async function FinanceReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const from =
    params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from)
      ? params.from
      : "";

  const to =
    params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to)
      ? params.to
      : "";

  const invalidRange = Boolean(from && to && from > to);

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

  let report: CanonicalReport | null = null;
  let reportError = false;

  if (!invalidRange) {
    const result = await supabase.rpc("finance_get_canonical_report", {
      p_from: from || null,
      p_to: to || null,
    });

    report = result.data as CanonicalReport | null;
    reportError = Boolean(result.error || !result.data);
  }

  const { data: expenses } = await supabase
    .from("finance_expenses")
    .select("amount,expense_date,category,voided_at");

  const expenseRows = (expenses ?? []) as Expense[];

  const inRange = (date: string) =>
    !invalidRange &&
    (!from || date >= from) &&
    (!to || date <= to);

  const periodExpenses = expenseRows.filter(
    (expense) => !expense.voided_at && inRange(expense.expense_date)
  );

  const categoryTotals = new Map<string, number>();

  for (const expense of periodExpenses) {
    categoryTotals.set(
      expense.category,
      (categoryTotals.get(expense.category) ?? 0) + Number(expense.amount)
    );
  }

  const categoryLabels: Record<string, string> = {
    parts: "قطع غيار",
    technician: "أجور فنيين",
    transport: "نقل",
    operations: "تشغيل",
    tools: "أدوات",
    marketing: "تسويق",
    other: "أخرى",
  };

  const categories = Array.from(categoryTotals.entries())
    .map(([category, amount]) => ({
      category,
      label: categoryLabels[category] || category,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  const currency = report?.currency || "SAR";
  const money = (value: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency,
    }).format(Number(value));

  return (
    <main className="adminPage financePortal">
      <div className="container adminContainer">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">الإدارة المالية</p>
            <h1>التقارير المالية</h1>
          </div>

          <Link className="button secondary" href="/admin/finance">
            العودة للنظرة العامة
          </Link>
        </div>

        <section className="card financePanel">
          <h2>الفترة المالية</h2>

          <form method="get" className="financeFilters">
            <label>
              من
              <input type="date" name="from" defaultValue={from} max={to || undefined} />
            </label>

            <label>
              إلى
              <input type="date" name="to" defaultValue={to} min={from || undefined} />
            </label>

            <div className="filterActions">
              <button className="button primary compactButton" type="submit">
                تطبيق
              </button>
              <Link className="button secondary compactButton" href="/admin/finance/reports">
                كل الفترات
              </Link>
            </div>
          </form>

          <p className="detailMuted">
            التحصيلات والاستردادات حسب تاريخها المالي بتوقيت السعودية،
            والمصروفات حسب تاريخ المصروف. صافي التحصيلات يخصم فقط
            الاستردادات الناجحة.
          </p>
        </section>

        {invalidRange ? (
          <section className="card financePanel">
            <h2>الفترة غير صحيحة</h2>
            <p>
              يجب أن يكون تاريخ «من» أقدم من أو مساويًا لتاريخ «إلى».
              صحح الفترة ثم اضغط «تطبيق».
            </p>
          </section>
        ) : reportError || !report ? (
          <section className="card financePanel" role="alert">
            <h2>تعذر تحميل التقرير المالي</h2>
            <p>لم يتم تغيير أي بيانات. أعد المحاولة لاحقًا.</p>
          </section>
        ) : (
          <>
            <div className="grid">
              <section className="card">
                <p className="eyebrow">إجمالي التحصيلات المؤكدة</p>
                <h2>{money(report.period.gross_receipts)}</h2>
              </section>

              <section className="card">
                <p className="eyebrow">الاستردادات الناجحة</p>
                <h2>{money(report.period.succeeded_refunds)}</h2>
              </section>

              <section className="card">
                <p className="eyebrow">صافي التحصيلات</p>
                <h2>{money(report.period.net_receipts)}</h2>
              </section>

              <section className="card">
                <p className="eyebrow">مصروفات الفترة</p>
                <h2>{money(report.period.expenses)}</h2>
              </section>

              <section className="card">
                <p className="eyebrow">صافي التدفق النقدي</p>
                <h2>{money(report.period.net_cash_flow)}</h2>
              </section>
            </div>

            <div className="grid">
              <section className="card">
                <p className="eyebrow">فواتير الفترة الصادرة</p>
                <h2>{money(report.period.issued_invoice_total)}</h2>
              </section>

              <section className="card">
                <p className="eyebrow">عدد الفواتير الصادرة</p>
                <h2>{report.period.issued_invoice_count}</h2>
              </section>

              <section className="card">
                <p className="eyebrow">الالتزامات غير المحصلة حاليًا</p>
                <h2>{money(report.current_position.contractual_outstanding)}</h2>
              </section>

              <section className="card">
                <p className="eyebrow">عهدة نقدية لدى الفنيين</p>
                <h2>{money(report.current_position.technician_cash_custody)}</h2>
              </section>
            </div>

            <section className="card financePanel">
              <h2>الموقف المالي الحالي</h2>

              <div className="financeReportSummary">
                <div>
                  <span>مبالغ محجوزة/قيد المطابقة</span>
                  <strong>{money(report.current_position.reserved_amount)}</strong>
                </div>
                <div>
                  <span>التزام استرداد فائض</span>
                  <strong>{money(report.current_position.excess_refund_liability)}</strong>
                </div>
                <div>
                  <span>طلبات تتطلب مراجعة</span>
                  <strong>{report.current_position.review_required_count}</strong>
                </div>
                <div>
                  <span>طلبات تتطلب مطابقة</span>
                  <strong>{report.current_position.reconciliation_required_count}</strong>
                </div>
              </div>
            </section>

            <section className="card financePanel">
              <h2>المصروفات حسب التصنيف</h2>

              {categories.length ? (
                <div className="financeTableWrap">
                  <table className="financeTable">
                    <thead>
                      <tr>
                        <th>التصنيف</th>
                        <th>الإجمالي</th>
                        <th>النسبة من المصروفات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((item) => {
                        const percentage =
                          report.period.expenses > 0
                            ? (item.amount / report.period.expenses) * 100
                            : 0;

                        return (
                          <tr key={item.category}>
                            <td>{item.label}</td>
                            <td>{money(item.amount)}</td>
                            <td>{percentage.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>لا توجد مصروفات مسجلة في الفترة.</p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
