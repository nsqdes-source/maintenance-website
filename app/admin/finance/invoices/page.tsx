import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InvoiceListClient from "./InvoiceListClient";

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

  const [
    { data: invoices },
    { data: coverageRows, error: coverageError },
    { data: summaryRows },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id,invoice_number,service_request_id,customer_name,customer_email,description,subtotal,tax_amount,total,status,created_at,issued_at,emailed_at"
      )
      .order("created_at", { ascending: false })
      .limit(200),

    supabase.rpc("finance_get_invoice_financial_coverage"),

    supabase.rpc("finance_get_invoice_list_summary"),
  ]);

  if (coverageError) {
    throw new Error("finance_invoice_coverage_unavailable");
  }

  const invoiceRows = (invoices ?? []) as Invoice[];
  const coverage = (coverageRows ?? []) as InvoiceCoverage[];
  const coverageByInvoice = new Map(
    coverage.map((row) => [row.invoice_id, row])
  );

  const money = (value: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
    }).format(Number(value));

  const getStatus = (invoice: Invoice) => {
    if (invoice.status === "void") {
      return { key: "void" as const, label: "ملغاة" };
    }

    const received = Math.max(
      0,
      Number(coverageByInvoice.get(invoice.id)?.net_received ?? 0)
    );
    const total = Number(invoice.total);

    if (invoice.status === "draft") {
      if (total > 0 && received >= total) {
        return { key: "draft" as const, label: "مسودة — مغطاة ماليًا" };
      }

      if (received > 0) {
        return { key: "draft" as const, label: "مسودة — مغطاة جزئيًا" };
      }

      return { key: "draft" as const, label: "مسودة" };
    }

    if (received >= total && total > 0) {
      return { key: "paid" as const, label: "مغطاة ماليًا" };
    }

    if (received > 0) {
      return { key: "partial" as const, label: "مغطاة جزئيًا" };
    }

    return { key: "unpaid" as const, label: "غير مغطاة" };
  };

  const summary = summaryRows?.[0] ?? {
    total_invoice_count: invoiceRows.length,
    issued_invoice_count: 0,
    issued_total: 0,
    fully_paid_draft_count: 0,
  };

  const totalInvoiceCount = Number(summary.total_invoice_count ?? 0);
  const issuedInvoiceCount = Number(summary.issued_invoice_count ?? 0);
  const issuedTotal = Number(summary.issued_total ?? 0);

  const issuedRows = invoiceRows.filter(
    (invoice) => invoice.status === "issued"
  );

  const collectedTotal = issuedRows.reduce(
    (sum, invoice) =>
      sum + Math.max(
      0,
      Number(coverageByInvoice.get(invoice.id)?.net_received ?? 0)
    ),
    0
  );

  const outstandingTotal = issuedRows.reduce(
    (sum, invoice) =>
      sum +
      Math.max(
        0,
        Number(invoice.total) -
          Math.max(
      0,
      Number(coverageByInvoice.get(invoice.id)?.net_received ?? 0)
    )
      ),
    0
  );

  const fullyPaidDraftCount = invoiceRows.filter((invoice) => {
    if (invoice.status !== "draft" || Number(invoice.total) <= 0) return false;

    return (
      Math.max(
      0,
      Number(coverageByInvoice.get(invoice.id)?.net_received ?? 0)
    ) >= Number(invoice.total)
    );
  }).length;

  const preparedInvoices = invoiceRows.map((invoice) => {
    const paid = Math.max(
      0,
      Number(coverageByInvoice.get(invoice.id)?.net_received ?? 0)
    );
    const remaining =
      invoice.status === "void"
        ? 0
        : Math.max(0, Number(invoice.total) - paid);
    const status = getStatus(invoice);

    return {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      customer_name: invoice.customer_name,
      customer_email: invoice.customer_email || "",
      total: Number(invoice.total),
      paid,
      remaining,
      date: new Date(
        invoice.issued_at || invoice.created_at
      ).toLocaleDateString("ar-SA"),
      status_key: status.key,
      status_label: status.label,
    };
  });

  return (
    <main className="adminPage financePortal">
      <div className="container adminContainer">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">الإدارة المالية</p>
            <h1>الفواتير</h1>
          </div>

          <Link className="button secondary" href="/admin/finance">
            العودة للنظرة العامة
          </Link>
        </div>

        <div className="grid">
          <section className="card">
            <p className="eyebrow">إجمالي الفواتير</p>
            <h2>{totalInvoiceCount}</h2>
          </section>

          <section className="card">
            <p className="eyebrow">الفواتير الصادرة</p>
            <h2>{issuedInvoiceCount}</h2>
            <p>{money(issuedTotal)}</p>
          </section>

          <section className="card">
            <p className="eyebrow">صافي التغطية المالية للفواتير الصادرة</p>
            <h2>{money(collectedTotal)}</h2>
          </section>

          <section className="card">
            <p className="eyebrow">المتبقي على الفواتير الصادرة</p>
            <h2>{money(outstandingTotal)}</h2>
          </section>

          <section className="card">
            <p className="eyebrow">مسودات مغطاة ماليًا بالكامل</p>
            <h2>{fullyPaidDraftCount}</h2>
          </section>
        </div>

        <section className="card financePanel">
          <div className="financeSectionHeader">
            <div>
              <h2>سجل الفواتير</h2>
              <p>
                حالة التغطية المالية تخص صافي الدفعات المرتبطة بالفاتورة بعد
                الاستردادات الناجحة.
              </p>
            </div>
          </div>

          <InvoiceListClient invoices={preparedInvoices} />
        </section>
      </div>
    </main>
  );
}
