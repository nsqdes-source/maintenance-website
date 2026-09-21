"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type WarrantyOption = { lineId: string; description: string; expiresAt: string; terms: string };

export default function WarrantyClaimForm({ requestId, options }: { requestId: string; options: WarrantyOption[] }) {
  const [lineId, setLineId] = useState(options[0]?.lineId ?? "");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!lineId || !description.trim()) return;
    setBusy(true);
    setMessage("");
    const { error } = await createClient().rpc("submit_warranty_claim", {
      target_service_request_id: requestId,
      target_invoice_line_item_id: lineId,
      claim_description: description.trim(),
    });
    setBusy(false);
    if (error) {
      const duplicate = error.message.includes("warranty_claim_already_open");
      setMessage(duplicate ? "يوجد طلب ضمان مفتوح لهذا البند بالفعل." : "تعذر تسجيل الطلب؛ تأكد من مدة الضمان وحاول مجددًا.");
      return;
    }
    setMessage("تم تسجيل طلب الضمان، وسيراجعه فريق معين.");
    setDescription("");
  }

  if (!options.length) return <details className="followupNotice"><summary>الضمان والمتابعة</summary><p>لا توجد بنود فاتورة صادرة بضمان ساري لهذا الطلب.</p></details>;
  const selected = options.find((option) => option.lineId === lineId);
  return <details className="followupNotice">
    <summary>طلب متابعة ضمن الضمان</summary>
    <label>البند المشمول<select value={lineId} onChange={(event) => setLineId(event.target.value)}>{options.map((option) => <option key={option.lineId} value={option.lineId}>{option.description} — حتى {new Date(option.expiresAt).toLocaleDateString("ar-SA")}</option>)}</select></label>
    {selected?.terms ? <p className="detailMuted">الشروط: {selected.terms}</p> : null}
    <label>وصف المشكلة بعد التنفيذ<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    <button className="button secondary compactButton" type="button" disabled={busy || !description.trim()} onClick={submit}>{busy ? "جارٍ الإرسال..." : "إرسال طلب الضمان"}</button>
    {message ? <p role="status">{message}</p> : null}
  </details>;
}
