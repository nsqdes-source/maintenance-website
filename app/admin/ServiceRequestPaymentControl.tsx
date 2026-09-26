"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Payment = {
  id: string;
  payment_type: string;
  amount: number;
  method: string;
  note: string;
  paid_at: string;
  voided_at: string | null;
  transferred_invoice_payment_id: string | null;
};

export default function ServiceRequestPaymentControl({
  requestId,
  payments,
}: {
  requestId: string;
  payments: Payment[];
}) {
  const router = useRouter();

  const [paymentType, setPaymentType] =
    useState("deposit");

  const [amount, setAmount] = useState("");
  const [method, setMethod] =
    useState("bank_transfer");

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const money = (value: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
    }).format(Number(value));

  const paymentTypeLabel = (value: string) =>
    (
      {
        visit_fee: "رسوم زيارة",
        deposit: "عربون",
        advance: "دفعة مقدمة",
        other: "دفعة أخرى",
      } as Record<string, string>
    )[value] || value;

  const methodLabel = (value: string) =>
    (
      {
        bank_transfer: "تحويل بنكي",
        cash: "نقدًا",
        card: "بطاقة",
        other: "أخرى",
      } as Record<string, string>
    )[value] || value;

  async function recordPayment() {
    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      setMessage("أدخل مبلغًا صحيحًا.");
      return;
    }

    setBusy(true);
    setMessage("");

    const { error } = await createClient().rpc(
      "finance_record_service_request_payment",
      {
        p_request_id: requestId,
        p_amount: numericAmount,
        p_payment_type: paymentType,
        p_method: method,
        p_note: note.trim(),
      }
    );

    setBusy(false);

    if (error) {
      const errorMessage =
        error.message === "payment_exceeds_invoice_remaining"
          ? "مبلغ الدفعة يتجاوز المبلغ المتبقي على الفاتورة."
          : error.message === "request_invoice_already_issued"
            ? "تم إصدار الفاتورة بالفعل، ويجب تسجيل التحصيل من الفاتورة مباشرة."
            : error.message === "completed_request_invoice_draft_required"
              ? "لا توجد فاتورة مسودة مرتبطة بهذا الطلب المكتمل."
              : error.message;

      setMessage(`تعذر تسجيل الدفعة: ${errorMessage}`);
      setBusy(false);
      return;
    }

    setAmount("");
    setNote("");
    setMessage("تم تسجيل الدفعة بنجاح.");
    router.refresh();
  }

  async function voidPayment(id: string) {
    if (
      !window.confirm(
        "إلغاء هذه الدفعة؟ سيبقى السجل محفوظًا."
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage("");

    const { error } = await createClient().rpc(
      "finance_void_service_request_payment",
      {
        p_payment_id: id,
      }
    );

    setBusy(false);

    if (error) {
      setMessage(
        `تعذر إلغاء الدفعة: ${error.message}`
      );
      return;
    }

    setMessage("تم إلغاء الدفعة.");
    router.refresh();
  }

  const activePayments = payments.filter(
    (payment) => !payment.voided_at
  );

  const activeTotal = activePayments.reduce(
    (sum, payment) =>
      sum + Number(payment.amount),
    0
  );

  return (
    <section className="card financePanel">
      <p className="eyebrow">
        التحصيل قبل الفاتورة
      </p>

      <h2>دفعات الطلب</h2>

      <p>
        استخدم هذا القسم لتسجيل رسوم الزيارة أو
        العربون أو أي دفعة مقدمة قبل إصدار
        الفاتورة النهائية.
      </p>

      <div className="financeGrid">
        <label>
          نوع الدفعة

          <select
            value={paymentType}
            onChange={(event) =>
              setPaymentType(event.target.value)
            }
          >
            <option value="visit_fee">
              رسوم زيارة
            </option>

            <option value="deposit">
              عربون
            </option>

            <option value="advance">
              دفعة مقدمة
            </option>

            <option value="other">
              دفعة أخرى
            </option>
          </select>
        </label>

        <label>
          المبلغ

          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) =>
              setAmount(event.target.value)
            }
          />
        </label>

        <label>
          طريقة الدفع

          <select
            value={method}
            onChange={(event) =>
              setMethod(event.target.value)
            }
          >
            <option value="bank_transfer">
              تحويل بنكي
            </option>

            <option value="cash">
              نقدًا
            </option>

            <option value="card">
              بطاقة
            </option>

            <option value="other">
              أخرى
            </option>
          </select>
        </label>

        <label>
          المرجع أو الملاحظة

          <input
            value={note}
            onChange={(event) =>
              setNote(event.target.value)
            }
            placeholder="مثال: عربون قبل بدء العمل"
          />
        </label>
      </div>

      {message ? (
        <p className="formMessage" role="status">
          {message}
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
          : "تسجيل الدفعة"}
      </button>

      <div className="requestItemsTotal">
        <span>
          إجمالي الدفعات النشطة
        </span>

        <strong>
          {money(activeTotal)}
        </strong>
      </div>

      <h3>سجل الدفعات</h3>

      {payments.length ? (
        <div className="assignmentHistory">
          {payments.map((payment) => (
            <div
              className="assignmentHistoryItem"
              key={payment.id}
            >
              <div>
                <strong>
                  {paymentTypeLabel(
                    payment.payment_type
                  )}
                </strong>

                <strong>
                  {money(payment.amount)}
                </strong>
              </div>

              <div>
                <span>
                  طريقة الدفع:{" "}
                  {methodLabel(payment.method)}
                </span>

                <span>
                  التاريخ:{" "}
                  {new Date(
                    payment.paid_at
                  ).toLocaleString("ar-SA", {
                    timeZone: "Asia/Riyadh",
                  })}
                </span>

                <span>
                  الحالة:{" "}
                  {payment.voided_at
                    ? "ملغاة"
                    : payment.transferred_invoice_payment_id
                      ? "مرحّلة للفاتورة"
                      : "نشطة"}
                </span>
              </div>

              {payment.note ? (
                <p>{payment.note}</p>
              ) : null}

              {!payment.voided_at &&
              !payment.transferred_invoice_payment_id ? (
                <button
                  type="button"
                  className="button secondary compactButton"
                  disabled={busy}
                  onClick={() =>
                    voidPayment(payment.id)
                  }
                >
                  إلغاء الدفعة
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="detailMuted">
          لا توجد دفعات مسجلة لهذا الطلب.
        </p>
      )}
    </section>
  );
}