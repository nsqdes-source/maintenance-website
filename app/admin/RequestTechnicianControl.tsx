"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TechnicianOption = { id: string; name: string; phone: string | null; serviceTypes: string[] };
type Props = {
  requestId: string;
  serviceType: string;
  technicians: TechnicianOption[];
  mode: "initial" | "pending" | "accepted" | "reassign" | "unavailable";
  previousTechnicianId?: string | null;
};

export default function RequestTechnicianControl({ requestId, serviceType, technicians, mode, previousTechnicianId }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(mode === "initial");
  const [technicianId, setTechnicianId] = useState("");
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const sortedTechnicians = technicians
    .filter(item => mode !== "reassign" || item.id !== previousTechnicianId)
    .sort((a, b) => Number(b.serviceTypes.includes(serviceType)) - Number(a.serviceTypes.includes(serviceType)) || a.name.localeCompare(b.name, "ar"));

  async function assign() {
    if (!technicianId) { setError("اختر فنيًا أولًا."); return; }
    if (mode === "reassign" && !reason.trim()) { setError("اكتب سبب إعادة الإسناد أولًا."); return; }
    setSaving(true);
    setError("");
    const client = createClient();
    const { error: assignError } = mode === "reassign"
      ? await client.rpc("admin_reassign_service_request", { target_service_request_id: requestId, target_technician_id: technicianId, reassignment_reason: reason.trim() })
      : await client.rpc("admin_assign_service_request", { target_service_request_id: requestId, target_technician_id: technicianId });
    if (assignError) {
      setError(assignError.message === "choose_different_technician" ? "اختر فنيًا آخر." : "تعذر إسناد الطلب للفني.");
      setSaving(false);
      return;
    }
    setExpanded(false);
    setSaving(false);
    router.refresh();
  }

  if (mode === "pending" || mode === "accepted" || mode === "unavailable") return null;
  return <div className="requestTechnicianControl">
    {mode === "reassign" ? <button className="button secondary compactButton" type="button" aria-label="إعادة إسناد الطلب لفني آخر" title="إعادة إسناد الطلب لفني آخر" onClick={() => setExpanded(value => !value)}>↻ إعادة الإسناد</button> : null}
    {expanded ? <>
      {mode === "reassign" ? <textarea value={reason} onChange={event => { setReason(event.target.value); setError(""); }} placeholder="سبب إعادة الإسناد (مطلوب)" rows={2} maxLength={500} disabled={saving} /> : null}
      <select value={technicianId} onChange={event => { setTechnicianId(event.target.value); setError(""); }} disabled={saving || !sortedTechnicians.length} aria-label={mode === "reassign" ? "الفني الجديد" : "الفني المسند"}>
        <option value="">{sortedTechnicians.length ? "اختر الفني" : "لا يوجد فني آخر نشط"}</option>
        {sortedTechnicians.map(item => <option key={item.id} value={item.id}>{item.name}{item.serviceTypes.includes(serviceType) ? " — مناسب للخدمة" : ""}</option>)}
      </select>
      <button className="button primary compactButton" type="button" onClick={assign} disabled={saving || !technicianId}>{saving ? "جارٍ الإسناد..." : mode === "reassign" ? "تأكيد إعادة الإسناد" : "إسناد"}</button>
    </> : null}
    {error ? <span className="inlineError" role="alert">{error}</span> : null}
  </div>;
}
