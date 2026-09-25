import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PaymentsClient from "./PaymentsClient";

export const dynamic = "force-dynamic";

const roles = new Set(["admin_manager", "super_admin"]);

type Invoice = {
  id: string;
  invoice_number: number;
  customer_name: string;
  total: number;
  status: string;
};

type Payment = {
  id: string;
  invoice_id: string;
  amount: number;
  method: string;
  note: string;
  paid_at: string;
  voided_at: string | null;
};

export default async function FinancePaymentsPage() {
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
      .select("id,invoice_number,customer_name,total,status")
      .order("created_at", { ascending: false }),

    supabase
      .from("invoice_payments")
      .select("id,invoice_id,amount,method,note,paid_at,voided_at")
      .order("paid_at", { ascending: false }),
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

  const collectibleInvoices = invoiceRows
    .filter((invoice) => invoice.status === "issued")
    .map((invoice) => {
      const paid = paidByInvoice.get(invoice.id) ?? 0;
      const remaining = Math.max(
        0,
        Number(invoice.total) - paid
      );

      return {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name,
        total: Number(invoice.total),
        paid,
        remaining,
      };
    })
    .filter((invoice) => invoice.remaining > 0);

  const collectedTotal = paymentRows
    .filter((payment) => !payment.voided_at)
    .reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );

  const voidedTotal = paymentRows
    .filter((payment) => payment.voided_at)
    .reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );

  return (
    <main className="adminPage financePortal">
      <div className="container adminContainer">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">الإدارة المالية</p>
            <h1>التحصيلات</h1>
          </div>

          <Link
            className="button secondary"
            href="/admin/finance"
          >
            العودة للنظرة العامة
          </Link>
        </div>

        <PaymentsClient
          invoices={collectibleInvoices}
          payments={paymentRows}
          invoiceNumbers={Object.fromEntries(
            invoiceRows.map((invoice) => [
              invoice.id,
              invoice.invoice_number,
            ])
          )}
          collectedTotal={collectedTotal}
          voidedTotal={voidedTotal}
        />
      </div>
    </main>
  );
}