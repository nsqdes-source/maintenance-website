import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InvoiceListClient from "./InvoiceListClient";

export const dynamic = "force-dynamic";

const roles = new Set([
  "admin_manager",
  "super_admin",
]);

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

type Payment = {
  invoice_id: string;
  amount: number;
  voided_at: string | null;
};

export default async function FinanceInvoicesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

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
    { data: summaryRows },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id,invoice_number,service_request_id,customer_name,customer_email,description,subtotal,tax_amount,total,status,created_at,issued_at,emailed_at"
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(200),

    supabase
      .from("invoice_payments")
      .select(
        "invoice_id,amount,voided_at"
      ),

    supabase.rpc("finance_get_invoice_list_summary"),
  ]);

  const invoiceRows =
    (invoices ?? []) as Invoice[];

  const paymentRows =
    (payments ?? []) as Payment[];

  const paidByInvoice =
    new Map<string, number>();

  for (const payment of paymentRows) {
    if (payment.voided_at) continue;

    paidByInvoice.set(
      payment.invoice_id,
      (paidByInvoice.get(
        payment.invoice_id
      ) ?? 0) + Number(payment.amount)
    );
  }

  const money = (value: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
    }).format(Number(value));

  const getStatus = (invoice: Invoice) => {
    if (invoice.status === "void") {
      return {
        key: "void" as const,
        label: "ملغاة",
      };
    }

    const received =
      paidByInvoice.get(invoice.id) ?? 0;

    if (invoice.status === "draft") {
      if (
        received >= Number(invoice.total) &&
        Number(invoice.total) > 0
      ) {
        return {
          key: "draft" as const,
          label: "مسودة — مدفوعة بالكامل",
        };
      }

      if (received > 0) {
        return {
          key: "draft" as const,
          label: "مسودة — مدفوعة جزئيًا",
        };
      }

      return {
        key: "draft" as const,
        label: "مسودة",
      };
    }

    if (
      received >= Number(invoice.total)
    ) {
      return {
        key: "paid" as const,
        label: "مدفوعة",
      };
    }

    if (received > 0) {
      return {
        key: "partial" as const,
        label: "مدفوعة جزئيًا",
      };
    }

    return {
      key: "unpaid" as const,
      label: "غير مدفوعة",
    };
  };

  const summary = summaryRows?.[0] ?? {
    total_invoice_count: invoiceRows.length,
    issued_invoice_count: 0,
    issued_total: 0,
    issued_collected_total: 0,
    issued_outstanding_total: 0,
    fully_paid_draft_count: 0,
  };

  const totalInvoiceCount = Number(summary.total_invoice_count ?? 0);
  const issuedInvoiceCount = Number(summary.issued_invoice_count ?? 0);
  const issuedTotal = Number(summary.issued_total ?? 0);
  const collectedTotal = Number(summary.issued_collected_total ?? 0);
  const outstandingTotal = Number(summary.issued_outstanding_total ?? 0);
  const fullyPaidDraftCount = Number(summary.fully_paid_draft_count ?? 0);

  const preparedInvoices =
    invoiceRows.map((invoice) => {
      const paid =
        paidByInvoice.get(invoice.id) ?? 0;

      const remaining =
        invoice.status === "void"
          ? 0
          : Math.max(
              0,
              Number(invoice.total) -
                paid
            );

      const status =
        getStatus(invoice);

      return {
        id: invoice.id,
        invoice_number:
          invoice.invoice_number,
        customer_name:
          invoice.customer_name,
        customer_email:
          invoice.customer_email || "",
        total: Number(invoice.total),
        paid,
        remaining,
        date: new Date(
          invoice.issued_at ||
            invoice.created_at
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
            <p className="eyebrow">
              الإدارة المالية
            </p>

            <h1>الفواتير</h1>
          </div>

          <Link
            className="button secondary"
            href="/admin/finance"
          >
            العودة للنظرة العامة
          </Link>
        </div>

        <div className="grid">
          <section className="card">
            <p className="eyebrow">
              إجمالي الفواتير
            </p>

            <h2>
              {totalInvoiceCount}
            </h2>
          </section>

          <section className="card">
            <p className="eyebrow">
              الفواتير الصادرة
            </p>

            <h2>
              {issuedInvoiceCount}
            </h2>

            <p>
              {money(issuedTotal)}
            </p>
          </section>

          <section className="card">
            <p className="eyebrow">
              المحصّل من الفواتير الصادرة
            </p>

            <h2>
              {money(collectedTotal)}
            </h2>
          </section>

          <section className="card">
            <p className="eyebrow">
              إجمالي المبالغ غير المحصلة
            </p>

            <h2>
              {money(
                outstandingTotal
              )}
            </h2>
          </section>

          <section className="card">
            <p className="eyebrow">
              مسودات مدفوعة بالكامل
            </p>

            <h2>
              {fullyPaidDraftCount}
            </h2>
          </section>
        </div>

        <section className="card financePanel">
          <div className="financeSectionHeader">
            <div>
              <h2>سجل الفواتير</h2>

              <p>
                ابحث وفلتر المسودات
                والفواتير الصادرة
                والمدفوعة والملغاة.
              </p>
            </div>
          </div>

          <InvoiceListClient
            invoices={preparedInvoices}
          />
        </section>
      </div>
    </main>
  );
}