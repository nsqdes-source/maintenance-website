"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Technician = {
  id: string;
  name: string;
  serviceTypes: string[];
};

type Props = {
  requestId: string;
  currentTechnicianId: string | null;
  technicians: Technician[];
};

export default function RequestTechnicianControl({ requestId, currentTechnicianId, technicians }: Props) {
  const router = useRouter();
  const [technicianId, setTechnicianId] = useState(currentTechnicianId ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    if (!technicianId) {
      setError("اختر فنيًا أولًا.");
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");

    const supabase = createClient();
    const { error: assignmentError } = await supabase.rpc("admin_assign_service_request", {
      target_request_id: requestId,
      target_technician_id: technicianId,
      assignment_notes: notes,
    });

    if (assignmentError) {
      setError("تعذر إسناد الطلب للفني.");
      setSaving(false);
      return;
    }

    setMessage("تم إسناد الطلب.");
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="assignmentControl">
      <select value={technicianId} onChange={(event) => { setTechnicianId(event.target.value); setMessage(""); setError(""); }} disabled={saving} aria-label="الفني المسند">
        <option value="">اختر الفني</option>
        {technicians.map((technician) => (
          <option key={technician.id} value={technician.id}>
            {technician.name}{technician.serviceTypes.length ? ` — ${technician.serviceTypes.join("، ")}` : ""}
          </option>
        ))}
      </select>
      <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="ملاحظات الإسناد (اختياري)" disabled={saving} />
      <button className="button primary compactButton" type="button" onClick={save} disabled={saving || !technicians.length}>
        {saving ? "جارٍ الإسناد..." : "إسناد"}
      </button>
      {message ? <span className="inlineSuccess">{message}</span> : null}
      {error ? <span className="inlineError">{error}</span> : null}
    </div>
  );
}
