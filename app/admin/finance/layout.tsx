import Link from "next/link";

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <nav className="financeNavigation" aria-label="التنقل المالي">
        <Link href="/admin/finance">نظرة عامة</Link>

        <Link href="/admin/finance/invoices">
        الفواتير
        </Link>

        <Link href="/admin/finance/payments">
        التحصيلات
        </Link>

        <Link href="/admin/finance/expenses">
        المصروفات
        </Link>

        <Link href="/admin/finance/reports">
        التقارير
        </Link>

        <Link href="/admin/finance/settings">
        الإعدادات المالية
        </Link>
      </nav>

      {children}
    </>
  );
}