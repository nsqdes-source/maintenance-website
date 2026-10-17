"use client";

import { useMemo, useState } from "react";
import { decideRefund, loadRefundOperations } from "./actions";
import type { RefundOperation, RefundOperations } from "./types";

const statusLabels: Record<RefundOperation["status"], string> = {
  requested: "مطلوب",
  approved: "معتمد",
  pending: "قيد التنفيذ",
  succeeded: "مسترد",
  failed: "فشل",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

const providerLabels: Record<RefundOperation["provider_processing_state"], string> = {
  manual: "استرداد يدوي",
  ready_for_provider: "جاهز للإرسال للمزود",
  provider_pending: "بانتظار نتيجة المزود",
  provider_terminal: "اكتملت معالجة المزود",
  not_ready: "غير جاهز للمزود",
};

function money(value: number, currency: string) {
  return `${Number(value).toFixed(2)} ${currency}`;
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function RefundOperationsClient({
  initialContext,
}: {
  initialContext: RefundOperations;
}) {
  const [context, setContext] = useState(initialContext);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [filter, setFilter] = useState<"all" | RefundOperation["status"]>("all");

  const filtered = useMemo(
    () =>
      context.refunds.filter((row) =>
        filter === "all" ? true : row.status === filter,
      ),
    [context.refunds, filter],
  );

  async function reload(offset: number) {
    setPending(true);
    const result = await loadRefundOperations(offset);
    if (result.ok) {
      setContext(result.context);
      setMessage("");
    } else {
      setMessage(result.message);
    }
    setPending(false);
  }

  async function act(
    id: string,
    decision: "approved" | "rejected" | "cancelled",
  ) {
    if (pending || !context.payment_domain_enabled) return;

    setPending(true);
    const result = await decideRefund(id, decision);
    setMessage(result.message);

    if (result.ok) {
      const fresh = await loadRefundOperations(context.offset);
      if (fresh.ok) setContext(fresh.context);
    }

    setPending(false);
  }

  return (
    <section className="refundOperations" aria-label="عمليات الاسترداد">
      {!context.payment_domain_enabled ? (
        <div className="refundReadOnlyNotice" role="status">
          وضع المراجعة فقط — مسار الدفع غير مفعّل، لذلك قرارات الاسترداد معطلة.
        </div>
      ) : null}

      <div className="refundFilters" aria-label="تصفية حالات الاسترداد">
        {(
          [
            ["all", "الكل"],
            ["requested", "مطلوب"],
            ["approved", "معتمد"],
            ["pending", "قيد التنفيذ"],
            ["succeeded", "مسترد"],
            ["failed", "فشل"],
            ["rejected", "مرفوض"],
            ["cancelled", "ملغي"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="financeInvoiceResultCount">
        النتائج في الصفحة الحالية: {filtered.length}
      </p>

      <div className="refundOperationsList">
        {filtered.map((row) => (
          <article className="card refundOperationCard" key={row.id}>
            <div className="refundOperationHeader">
              <div>
                <p className="eyebrow">{row.customer_name || "طلب خدمة"}</p>
                <h2>{money(row.amount, row.currency)}</h2>
              </div>
              <span className={`refundStatus refundStatus-${row.status}`}>
                {statusLabels[row.status]}
              </span>
            </div>

            <div className="refundOperationGrid">
              <div>
                <span>الطلب</span>
                <bdi>{row.service_request_id}</bdi>
              </div>
              <div>
                <span>الفاتورة</span>
                <strong>
                  {row.invoice_number ? `#${row.invoice_number}` : "—"}
                </strong>
              </div>
              <div>
                <span>الدفعة الأصلية</span>
                <strong>{money(row.origin_amount, row.currency)}</strong>
              </div>
              <div>
                <span>نوع الأصل</span>
                <strong>
                  {row.origin_type === "service_request_payment"
                    ? "دفعة طلب"
                    : "دفعة فاتورة"}
                </strong>
              </div>
              <div>
                <span>طريقة الدفع</span>
                <strong>{row.origin_method}</strong>
              </div>
              <div>
                <span>تاريخ الطلب</span>
                <strong>{dateTime(row.requested_at)}</strong>
              </div>
            </div>

            <div className="refundReason">
              <strong>السبب</strong>
              <p>{row.reason}</p>
              {row.note ? <small>{row.note}</small> : null}
            </div>

            <div className="refundProviderState">
              <span>{providerLabels[row.provider_processing_state]}</span>
              {row.provider ? <bdi>{row.provider}</bdi> : null}
              {row.provider_refund_id ? (
                <small>
                  Provider Refund ID: <bdi>{row.provider_refund_id}</bdi>
                </small>
              ) : null}
              {row.failure_code ? (
                <small>رمز الفشل: {row.failure_code}</small>
              ) : null}
            </div>

            {(row.can_decide || row.can_cancel) ? (
              <div className="refundActions">
                {row.can_decide ? (
                  <>
                    <button
                      type="button"
                      className="button"
                      disabled={pending || !context.payment_domain_enabled}
                      onClick={() => act(row.id, "approved")}
                    >
                      اعتماد
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={pending || !context.payment_domain_enabled}
                      onClick={() => act(row.id, "rejected")}
                    >
                      رفض
                    </button>
                  </>
                ) : null}
                {row.can_cancel ? (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={pending || !context.payment_domain_enabled}
                    onClick={() => act(row.id, "cancelled")}
                  >
                    إلغاء
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="financeInvoiceEmpty">لا توجد عمليات استرداد مطابقة.</div>
      ) : null}

      <div className="refundPagination">
        <button
          type="button"
          disabled={pending || context.offset === 0}
          onClick={() => reload(Math.max(0, context.offset - context.limit))}
        >
          السابق
        </button>
        <button
          type="button"
          disabled={pending || context.refunds.length < context.limit}
          onClick={() => reload(context.offset + context.limit)}
        >
          التالي
        </button>
      </div>

      <p role="status" className="refundMessage">
        {message}
      </p>
    </section>
  );
}
