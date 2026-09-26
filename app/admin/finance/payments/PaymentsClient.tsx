"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Invoice = {
  id: string;
  invoice_number: number;
  customer_name: string;
  total: number;
  paid: number;
  remaining: number;
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

export default function PaymentsClient({
  invoices,
  payments,
  invoiceNumbers,
  collectedTotal,
  voidedTotal,
}: {
  invoices: Invoice[];
  payments: Payment[];
  invoiceNumbers: Record<string, number>;
  collectedTotal: number;
  voidedTotal: number;
}) {
  const router = useRouter();

  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "voided"
  > ("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const money = (value: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
    }).format(Number(value));

  const selectedInvoice = invoices.find(
    (invoice) => invoice.id === invoiceId
  );

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return payments.filter((payment) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && !payment.voided_at) ||
        (statusFilter === "voided" && payment.voided_at);

      if (!matchesStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      const invoiceNumber =
        invoiceNumbers[payment.invoice_id];

      return (
        String(invoiceNumber ?? "").includes(query) ||
        payment.note.toLowerCase().includes(query) ||
        payment.method.toLowerCase().includes(query)
      );
    });
  }, [
    payments,
    search,
    statusFilter,
    invoiceNumbers,
  ]);

  async function recordPayment() {
    if (!invoiceId) {
      setMessage("اختر فاتورة.");
      return;
    }

    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      setMessage("أدخل مبلغ تحصيل صحيحًا.");
      return;
    }

    if (
      selectedInvoice &&
      numericAmount > selectedInvoice.remaining
    ) {
      setMessage("المبلغ أكبر من الرصيد المتبقي.");
      return;
    }

    setBusy(true);
    setMessage("");

    const { error } = await createClient().rpc(
      "finance_record_payment",
      {
        p_invoice_id: invoiceId,
        p_amount: numericAmount,
        p_method: method,
        p_note: note,
      }
    );

    setBusy(false);

    if (error) {
      setMessage(
        `تعذر تسجيل التحصيل: ${error.message}`
      );
      return;
    }

    setInvoiceId("");
    setAmount("");
    setNote("");
    setMessage("تم تسجيل التحصيل.");
    router.refresh();
  }

  async function voidPayment(id: string) {
    if (
      !window.confirm(
        "إلغاء قيد التحصيل؟ سيبقى محفوظًا في السجل."
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage("");

    const { error } = await createClient().rpc(
      "finance_void_payment",
      {
        p_payment_id: id,
      }
    );

    setBusy(false);

    if (error) {
      setMessage(
        `تعذر إلغاء القيد: ${error.message}`
      );
      return;
    }

    setMessage("تم إلغاء قيد التحصيل.");
    router.refresh();
  }

  const methodLabel = (value: string) =>
    (
      {
        bank_transfer: "تحويل بنكي",
        cash: "نقدًا",
        card: "بطاقة",
        other: "أخرى",
      } as Record<string, string>
    )[value] || value;

  return (
    <>
      <div className="grid">
        <section className="card">
          <p className="eyebrow">المحصّل الفعلي</p>
          <h2>{money(collectedTotal)}</h2>
        </section>

        <section className="card">
          <p className="eyebrow">
            فواتير لها رصيد مستحق
          </p>
          <h2>{invoices.length}</h2>
        </section>

        <section className="card">
          <p className="eyebrow">
            قيود تحصيل ملغاة
          </p>
          <h2>{money(voidedTotal)}</h2>
        </section>
      </div>

      {message ? (
        <p className="formMessage" role="status">
          {message}
        </p>
      ) : null}

      <section className="card financePanel">
        <h2>تسجيل تحصيل جديد</h2>

        <p>
          اختر الفاتورة وسجل المبلغ الذي استلمته
          المؤسسة فعليًا.
        </p>

        <div className="financeGrid">
          <label>
            الفاتورة
            <select
              value={invoiceId}
              onChange={(event) => {
                setInvoiceId(event.target.value);
                setAmount("");
              }}
            >
              <option value="">
                اختر فاتورة صادرة
              </option>

              {invoices.map((invoice) => (
                <option
                  key={invoice.id}
                  value={invoice.id}
                >
                  #{invoice.invoice_number} ·{" "}
                  {invoice.customer_name} · متبقي{" "}
                  {money(invoice.remaining)}
                </option>
              ))}
            </select>
          </label>

          <label>
            المبلغ المحصّل
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={
                selectedInvoice?.remaining
              }
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value)
              }
            />
          </label>

          <label>
            طريقة التحصيل
            <select
              value={method}
              onChange={(event) =>
                setMethod(event.target.value)
              }
            >
              <option value="bank_transfer">
                تحويل بنكي
              </option>
              <option value="cash">نقدًا</option>
              <option value="card">بطاقة</option>
              <option value="other">أخرى</option>
            </select>
          </label>

          <label>
            مرجع أو ملاحظة
            <input
              value={note}
              onChange={(event) =>
                setNote(event.target.value)
              }
              placeholder="مثال: رقم الحوالة"
            />
          </label>
        </div>

        {selectedInvoice ? (
          <p className="inlineHint">
            الرصيد المتبقي:{" "}
            <strong>
              {money(selectedInvoice.remaining)}
            </strong>
          </p>
        ) : null}

        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={recordPayment}
        >
          {busy
            ? "جارٍ الحفظ..."
            : "تسجيل التحصيل"}
        </button>
      </section>

      <section className="card financePanel">
        <h2>سجل التحصيلات</h2>

        <div className="financeInvoiceSearch">
          <label htmlFor="payment-search">
            البحث
          </label>

          <input
            id="payment-search"
            type="search"
            placeholder="رقم الفاتورة أو المرجع"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />

          <div>
            <button
              type="button"
              className="button secondary compactButton"
              onClick={() => setStatusFilter("all")}
            >
              الكل
            </button>

            <button
              type="button"
              className="button secondary compactButton"
              onClick={() => setStatusFilter("active")}
            >
              النشطة
            </button>

            <button
              type="button"
              className="button secondary compactButton"
              onClick={() => setStatusFilter("voided")}
            >
              الملغاة
            </button>
          </div>
        </div>

        {filteredPayments.length ? (
          <div className="financeTableWrap">
            <table className="financeTable">
              <thead>
                <tr>
                  <th>الفاتورة</th>
                  <th>المبلغ</th>
                  <th>الطريقة</th>
                  <th>المرجع</th>
                  <th>التاريخ</th>
                  <th>الحالة</th>
                  <th>الإجراء</th>
                </tr>
              </thead>

              <tbody>
                {filteredPayments.map(
                  (payment) => (
                    <tr key={payment.id}>
                      <td>
                        #
                        {invoiceNumbers[
                          payment.invoice_id
                        ] ?? "—"}
                      </td>

                      <td>
                        {money(payment.amount)}
                      </td>

                      <td>
                        {methodLabel(
                          payment.method
                        )}
                      </td>

                      <td>
                        {payment.note || "—"}
                      </td>

                      <td>
                        {new Date(
                          payment.paid_at
                        ).toLocaleDateString(
                          "ar-SA"
                        )}
                      </td>

                      <td>
                        {payment.voided_at
                          ? "ملغي"
                          : "نشط"}
                      </td>

                      <td>
                        {!payment.voided_at ? (
                          <button
                            type="button"
                            className="button secondary compactButton"
                            disabled={busy}
                            onClick={() =>
                              voidPayment(
                                payment.id
                              )
                            }
                          >
                            إلغاء القيد
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p>لا توجد تحصيلات مطابقة.</p>
        )}
      </section>
    </>
  );
}