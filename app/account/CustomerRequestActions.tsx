"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/app/components/LocaleContext";

type Props = { requestId: string; workflowStage: string };

export default function CustomerRequestActions({ requestId, workflowStage }: Props) {
  const locale = useLocale();
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const canCancel = ["awaiting_assignment", "assigned"].includes(workflowStage);
  const canReject = false;

  if (!canCancel && !canReject) return null;

  async function run(action: "cancel" | "reject") {
    const message = action === "cancel"
      ? t("هل أنت متأكد من إلغاء طلب الخدمة؟", "Are you sure you want to cancel this request?")
      : t("هل تريد رفض الإصلاح المقترح والقطع/التعديل؟", "Do you want to decline the proposed repair?");
    if (!window.confirm(message)) return;

    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: actionError } = action === "cancel"
      ? await supabase.rpc("customer_cancel_service_request", { target_service_request_id: requestId, cancellation_reason: reason.trim() || null })
      : await supabase.rpc("customer_reject_repair", { target_service_request_id: requestId, rejection_notes: reason.trim() || null });

    if (actionError) {
      setError(actionError.message === "request_cannot_be_cancelled" || actionError.message === "technician_already_accepted"
        ? t("لا يمكن إلغاء الطلب في مرحلته الحالية.", "This request cannot be cancelled at its current stage.")
        : actionError.message === "repair_rejection_not_available"
          ? t("لا يمكن رفض الإصلاح في مرحلته الحالية.", "The repair cannot be declined at its current stage.")
          : t("تعذر تنفيذ الإجراء. حاول مرة أخرى.", "Could not complete the action. Try again."));
      setBusy(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="customerRequestActions">
      <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} placeholder={canCancel ? t("سبب الإلغاء (اختياري)", "Cancellation reason (optional)") : t("سبب رفض الإصلاح (اختياري)", "Reason for declining (optional)")} disabled={busy} />
      {canCancel ? (
        <button type="button" className="button secondary compactButton" disabled={busy} onClick={() => run("cancel")}>
          {busy ? t("جارٍ التنفيذ...", "Working...") : t("إلغاء طلب الخدمة", "Cancel request")}
        </button>
      ) : null}
      {canReject ? (
        <button type="button" className="button secondary compactButton" disabled={busy} onClick={() => run("reject")}>
          {busy ? t("جارٍ التنفيذ...", "Working...") : t("رفض الإصلاح", "Decline repair")}
        </button>
      ) : null}
      {error ? <span className="inlineError" role="alert">{error}</span> : null}
      <style jsx>{`.customerRequestActions{display:grid;gap:8px;margin-top:14px;max-width:520px}.customerRequestActions textarea{width:100%;resize:vertical;border:1px solid rgba(0,0,0,.14);border-radius:10px;padding:10px;font:inherit}.inlineError{color:#b42318;font-size:.88rem}`}</style>
    </div>
  );
}
