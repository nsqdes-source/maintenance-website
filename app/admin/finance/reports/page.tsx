import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const roles = new Set(["admin_manager", "super_admin"]);

type Invoice = {
  id: string;
  total: number;
  status: string;
  issued_at: string | null;
  created_at: string;
};

type Payment = {
  invoice_id: string;
  amount: number;
  paid_at: string;
  voided_at: string | null;
};

type Expense = {
  amount: number;
  expense_date: string;
  category: string;
  voided_at: string | null;
};

const money = (value: number) =>
  new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
  }).format(Number(value));

const dateKey = (date: string) => date.slice(0, 10);

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

  const inRange = (date: string) => {
    const key = dateKey(date);
    return (!from || key >= from) && (!to || key <= to);
  };

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

  const [
    { data: invoices },
    { data: payments },
    { data: expenses },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("id,total,status,issued_at,created_at"),

    supabase
      .from("invoice_payments")
      .select("invoice_id,amount,paid_at,voided_at"),

    supabase
      .from("finance_expenses")
      .select("amount,expense_date,category,voided_at"),
  ]);

  const invoiceRows = (invoices ?? []) as Invoice[];
  const paymentRows = (payments ?? []) as Payment[];
  const expenseRows = (expenses ?? []) as Expense[];

  const activePayments = paymentRows.filter(
    (payment) => !payment.voided_at
  );

  const activeExpenses = expenseRows.filter(
    (expense) => !expense.voided_at
  );

  const issuedInvoices = invoiceRows.filter(
    (invoice) =>
      invoice.status === "issued" &&
      inRange(invoice.issued_at || invoice.created_at)
  );

  const periodPayments = activePayments.filter(
    (payment) => inRange(payment.paid_at)
  );

  const periodExpenses = activeExpenses.filter(
    (expense) => inRange(expense.expense_date)
  );

  const issuedInvoiceIds = new Set(
    issuedInvoices.map((invoice) => invoice.id)
  );

  const issuedTotal = issuedInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total),
    0
  );

  const collectedTotal = periodPayments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0
  );

  const issuedCollectedTotal = activePayments
    .filter((payment) => issuedInvoiceIds.has(payment.invoice_id))
    .reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );

  const expenseTotal = periodExpenses.reduce(
    (sum, expense) => sum + Number(expense.amount),
    0
  );

  const netCashFlow = collectedTotal - expenseTotal;

  const outstandingTotal = Math.max(
    0,
    issuedTotal - issuedCollectedTotal
  );

  const periodCashFlow = collectedTotal - expenseTotal;

  const categoryTotals = new Map<string, number>();

  for (const expense of periodExpenses) {
    categoryTotals.set(
      expense.category,
      (categoryTotals.get(expense.category) ?? 0) +
        Number(expense.amount)
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

  return (
    <main className="adminPage financePortal">
      <div className="container adminContainer">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">الإدارة المالية</p>
            <h1>التقارير المالية</h1>
          </div>

          <Link
            className="button secondary"
            href="/admin/finance"
          >
            العودة للنظرة العامة
          </Link>
        </div>

        <section className="card financePanel">
          <h2>الفترة المالية</h2>

          <form method="get" className="financeFilters">
            <label>
              من
              <input type="date" name="from" defaultValue={from} />
            </label>

            <label>
              إلى
              <input type="date" name="to" defaultValue={to} />
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
            التحصيلات حسب تاريخ الدفع، والمصروفات حسب تاريخ المصروف،
            والفواتير حسب تاريخ الإصدار. رصيد فواتير الفترة يحسب ما تم
            تحصيله عليها حتى الآن.
          </p>
        </section>

        <div className="grid">
          <section className="card">
            <p className="eyebrow">تحصيلات الفترة النشطة</p>
            <h2>{money(collectedTotal)}</h2>
          </section>

          <section className="card">
            <p className="eyebrow">مصروفات الفترة</p>
            <h2>{money(expenseTotal)}</h2>
          </section>

          <section className="card">
            <p className="eyebrow">صافي التدفق النقدي للفترة</p>
            <h2>{money(netCashFlow)}</h2>
          </section>
        </div>

        <div className="grid">
          <section className="card">
            <p className="eyebrow">فواتير الفترة الصادرة</p>
            <h2>{money(issuedTotal)}</h2>
          </section>

          <section className="card">
            <p className="eyebrow">المحصّل حتى الآن من فواتير الفترة</p>
            <h2>{money(issuedCollectedTotal)}</h2>
          </section>

          <section className="card">
            <p className="eyebrow">غير المحصّل من فواتير الفترة</p>
            <h2>{money(outstandingTotal)}</h2>
          </section>

          <section className="card">
            <p className="eyebrow">عدد فواتير الفترة الصادرة</p>
            <h2>{issuedInvoices.length}</h2>
          </section>
        </div>

        <section className="card financePanel">
          <h2>ملخص الفترة</h2>

          <div className="financeReportSummary">
            <div>
              <span>التحصيلات</span>
              <strong>{money(collectedTotal)}</strong>
            </div>

            <div>
              <span>المصروفات</span>
              <strong>{money(expenseTotal)}</strong>
            </div>

            <div>
              <span>صافي التدفق النقدي</span>
              <strong>{money(periodCashFlow)}</strong>
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
                      expenseTotal > 0
                        ? (item.amount / expenseTotal) * 100
                        : 0;

                    return (
                      <tr key={item.category}>
                        <td>{item.label}</td>
                        <td>{money(item.amount)}</td>
                        <td>
                          {percentage.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p>لا توجد مصروفات مسجلة بعد.</p>
          )}
        </section>
      </div>
    </main>
  );
}
