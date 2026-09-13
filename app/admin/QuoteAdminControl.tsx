"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function QuoteAdminControl({ requestId, stage, archived }: { requestId: string; stage: string; archived: boolean }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [parts, setParts] = useState("");
  const [partsCost, setPartsCost] = useState("0");
  const [laborCost, setLaborCost] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitQuote() {
    setBusy(true);
    setError("");
    const { error: resultError } = await createClient().rpc("admin_submit_service_request_quote", {
      target_service_request_id: requestId,
      quote_description: description.trim(),
      quote_parts_description: parts.trim() || null,
      quote_parts_cost: Number(partsCost),
      quote_labor_cost: Number(laborCost),
    });
    setBusy(false);
    if (resultError) { setError("تعذر إرسال العرض. تحقق من الوصف والتكاليف ومرحلة الطلب."); return; }
    router.refresh();
  }

  async function setArchive(shouldArchive: boolean) {
    setBusy(true);
    setError("");
    const { error: resultError } = await createClient().rpc("admin_set_service_request_archive", {
      target_service_request_id: requestId,
      should_archive: shouldArchive,
    });
    setBusy(false);
    if (resultError) { setError("تعذر تحديث الأرشفة."); return; }
    router.refresh();
  }

  const closed = ["completed", "customer_rejected", "customer_cancelled", "cancelled"].includes(stage);
  return <div className="technicianResponseControl">
    {stage === "awaiting_admin_quote" ? <>
      <label>وصف الإصلاح<input value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label>القطع أو التعديلات<input value={parts} onChange={e => setParts(e.target.value)} /></label>
      <label>تكلفة القطع<input type="number" min="0" step="0.01" value={partsCost} onChange={e => setPartsCost(e.target.value)} /></label>
      <label>تكلفة العمل<input type="number" min="0" step="0.01" value={laborCost} onChange={e => setLaborCost(e.target.value)} /></label>
      <button type="button" className="button primary compactButton" disabled={busy || !description.trim()} onClick={submitQuote}>إرسال العرض للعميل</button>
    </> : null}
    {closed ? <button type="button" className="button secondary compactButton" disabled={busy} onClick={() => setArchive(!archived)}>
      {archived ? "إعادة من الأرشيف" : "أرشفة الطلب"}
    </button> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>;
}
