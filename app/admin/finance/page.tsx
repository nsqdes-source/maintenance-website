import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FinanceDashboard from "./FinanceDashboard";

export const dynamic = "force-dynamic";

const roles = new Set(["admin_manager", "super_admin"]);

type InvoiceCoverage = {
  invoice_id: string;
  invoice_status: string;
  invoice_total: number;
  gross_received: number;
  succeeded_refunds: number;
  net_received: number;
  remaining: number;
  is_fully_covered: boolean;
};

type CanonicalReport = {
  currency: string | null;
  period: {
    gross_receipts: number;
    succeeded_refunds: number;
    net_receipts: number;
    expenses: number;
    net_cash_flow: number;
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
    financial_request_count: number;
  };
};

export default async function FinancePage() {
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

  const [
    { data: invoices },
    { data: reportData, error: reportError },
    { data: coverageRows, error: coverageError },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id,invoice_number,customer_name,customer_email,total,status,created_at,issued_at"
      )
      .order("created_at", { ascending: false })
      .limit(5),

    supabase.rpc("finance_get_canonical_report", {
      p_from: null,
      p_to: null,
    }),

    supabase.rpc("finance_get_invoice_financial_coverage"),
  ]);

  if (reportError) {
    throw new Error("finance_canonical_report_unavailable");
  }

  const report = reportData as CanonicalReport;

  if (coverageError) {
    throw new Error("finance_invoice_coverage_unavailable");
  }

  const coverage = (coverageRows ?? []) as InvoiceCoverage[];
  const coverageByInvoice = new Map(
    coverage.map((row) => [row.invoice_id, row])
  );

  const collectedIssuedCount = coverage.filter(
    (row) => row.invoice_status === "issued" && row.is_fully_covered
  ).length;

  const latestInvoices = (invoices ?? []).map((invoice) => ({
    ...invoice,
    paid: Math.max(
      0,
      Number(coverageByInvoice.get(invoice.id)?.net_received ?? 0)
    ),
  }));

  return (
    <main className="adminPage financePortal">
      <div className="container adminContainer">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">الإدارة المالية</p>
            <h1>المالية والفواتير</h1>
          </div>

          <Link className="button secondary" href="/admin">
            العودة للإدارة
          </Link>
        </div>

        <FinanceDashboard
          invoices={latestInvoices}
          collectedIssuedCount={collectedIssuedCount}
          currency={report.currency || "SAR"}
          report={report}
        />
      </div>
    </main>
  );
}
