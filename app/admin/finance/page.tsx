import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FinanceDashboard from "./FinanceDashboard";

export const dynamic = "force-dynamic";

const roles = new Set(["admin_manager", "super_admin"]);

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
    { data: issuedInvoices },
    { data: payments },
    { data: refunds },
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

    supabase
      .from("invoices")
      .select("id,total")
      .eq("status", "issued"),

    supabase
      .from("invoice_payments")
      .select("invoice_id,amount,voided_at"),

    supabase
      .from("payment_refunds")
      .select("invoice_id,amount,status")
      .eq("status", "succeeded")
      .not("invoice_id", "is", null),
  ]);

  if (reportError) {
    throw new Error("finance_canonical_report_unavailable");
  }

  const report = reportData as CanonicalReport;

  const netPaidByInvoice = new Map<string, number>();

  for (const payment of payments ?? []) {
    if (payment.voided_at) continue;

    netPaidByInvoice.set(
      payment.invoice_id,
      (netPaidByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount)
    );
  }

  for (const refund of refunds ?? []) {
    if (!refund.invoice_id) continue;

    netPaidByInvoice.set(
      refund.invoice_id,
      (netPaidByInvoice.get(refund.invoice_id) ?? 0) - Number(refund.amount)
    );
  }

  const collectedIssuedCount = (issuedInvoices ?? []).filter((invoice) => {
    const netPaid = Math.max(0, netPaidByInvoice.get(invoice.id) ?? 0);

    return Number(invoice.total) > 0 && netPaid >= Number(invoice.total);
  }).length;

  const latestInvoices = (invoices ?? []).map((invoice) => ({
    ...invoice,
    paid: Math.max(0, netPaidByInvoice.get(invoice.id) ?? 0),
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
