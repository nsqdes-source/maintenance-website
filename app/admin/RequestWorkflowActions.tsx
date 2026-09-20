"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const CLOSED = new Set(["completed", "customer_rejected", "customer_cancelled", "cancelled"]);

export default function RequestWorkflowActions({ requestId, stage }: { requestId: string; stage: string }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [period, setPeriod] = useState("");
  const [notes, setNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canSchedule = stage === "technician_accepted" || stage === "reschedule_requested";

  async function confirmAppointment() {
    if (!date || !period.trim()) { setError("أدخل تاريخ الموعد والفترة الزمنية."); return; }
    setBusy(true); setError("");
    const { error: resultError } = await createClient().rpc("admin_confirm_service_request_appointment", {
      target_service_request_id: requestId, appointment_date: date, appointment_time_period: period.trim(), notes: notes.trim() || null,
    });
    setBusy(false);
    if (resultError) { setError("تعذر تأكيد الموعد. تأكد من التاريخ والفترة الزمنية."); return; }
    router.refresh();
  }

  async function cancelRequest() {
    if (!cancelReason.trim()) { setError("اكتب سبب الإلغاء قبل المتابعة."); return; }
    if (!window.confirm("سيُلغى الطلب وتُحفظ الأسباب في سجل التدقيق. هل تريد المتابعة؟")) return;
    setBusy(true); setError("");
    const { error: resultError } = await createClient().rpc("admin_cancel_service_request", { target_service_request_id: requestId, reason: cancelReason.trim() });
    setBusy(false);
    if (resultError) { setError("تعذر إلغاء الطلب."); return; }
    router.refresh();
  }

  if (CLOSED.has(stage)) return null;
  return <div className="technicianResponseControl">
    {canSchedule ? <><label>تاريخ الموعد المؤكد<input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={event => setDate(event.target.value)} disabled={busy} /></label><label>الفترة الزمنية<input value={period} placeholder="مثلًا: 4:00–6:00 مساءً" onChange={event => setPeriod(event.target.value)} disabled={busy} /></label><label>ملاحظات الموعد (اختياري)<textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)} disabled={busy} /></label><button type="button" className="button secondary compactButton" disabled={busy} onClick={confirmAppointment}>تأكيد الموعد</button></> : null}
    <details><summary>إلغاء إداري</summary><label>سبب الإلغاء<textarea rows={2} value={cancelReason} onChange={event => setCancelReason(event.target.value)} disabled={busy} /></label><button type="button" className="button secondary compactButton" disabled={busy} onClick={cancelRequest}>إلغاء الطلب</button></details>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>;
}
