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

        <span className="financeNavPending" aria-disabled="true">
          التحصيلات
        </span>

        <span className="financeNavPending" aria-disabled="true">
          المصروفات
        </span>

        <span className="financeNavPending" aria-disabled="true">
          التقارير
        </span>

        <span className="financeNavPending" aria-disabled="true">
          الإعدادات المالية
        </span>
      </nav>

      {children}
    </>
  );
}