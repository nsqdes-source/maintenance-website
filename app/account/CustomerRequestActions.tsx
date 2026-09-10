"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = { requestId: string; workflowStage: string };

export default function CustomerRequestActions({ requestId, workflowStage }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const canCancel = ["awaiting_assignment", "assigned"].includes(workflowStage);
  const canReject = workflowStage === "needs_followup";

  if (!canCancel && !canReject) return null;

  async function run(action: "cancel" | "reject") {
    const message = action === "cancel"
      ? "هل أنت متأكد من إلغاء طلب الخدمة؟"
      : "هل تريد رفض الإصلاح المقترح والقطع/التعديل؟";
    if (!window.confirm(message)) return;

    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: actionError } = action === "cancel"
      ? await supabase.rpc("customer_cancel_service_request", { target_service_request_id: requestId, cancellation_reason: reason.trim() || null })
      : await supabase.rpc("customer_reject_repair", { target_service_request_id: requestId, rejection_notes: reason.trim() || null });

    if (actionError) {
      setError(actionError.message === "request_cannot_be_cancelled" || actionError.message === "technician_already_accepted"
        ? "لا يمكن إلغاء الطلب في مرحلته الحالية."
        : actionError.message === "repair_rejection_not_available"
          ? "لا يمكن رفض الإصلاح في مرحلته الحالية."
          : "تعذر تنفيذ الإجراء. حاول مرة أخرى.");
      setBusy(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="customerRequestActions">
      <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} placeholder={canCancel ? "سبب الإلغاء (اختياري)" : "سبب رفض الإصلاح (اختياري)"} disabled={busy} />
      {canCancel ? (
        <button type="button" className="button secondary compactButton" disabled={busy} onClick={() => run("cancel")}>
          {busy ? "جارٍ التنفيذ..." : "إلغاء طلب الخدمة"}
        </button>
      ) : null}
      {canReject ? (
        <button type="button" className="button secondary compactButton" disabled={busy} onClick={() => run("reject")}>
          {busy ? "جارٍ التنفيذ..." : "رفض الإصلاح"}
        </button>
      ) : null}
      {error ? <span className="inlineError" role="alert">{error}</span> : null}
      <style jsx>{`.customerRequestActions{display:grid;gap:8px;margin-top:14px;max-width:520px}.customerRequestActions textarea{width:100%;resize:vertical;border:1px solid rgba(0,0,0,.14);border-radius:10px;padding:10px;font:inherit}.inlineError{color:#b42318;font-size:.88rem}`}</style>
    </div>
  );
}
