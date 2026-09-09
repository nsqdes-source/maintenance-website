"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Outcome = "completed" | "needs_followup" | "customer_rejected";
type Props = { requestId: string };

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: "completed", label: "تم التنفيذ" },
  { value: "needs_followup", label: "بحاجة إلى قطعة / تعديل" },
  { value: "customer_rejected", label: "العميل رفض الإصلاح" },
];

const ERROR_MESSAGES: Record<string, string> = {
  technician_not_found: "لا يمكن تسجيل نتيجة الزيارة لأن حساب الفني غير نشط أو غير مرتبط بشكل صحيح.",
  accepted_assignment_not_found: "لا يمكن تسجيل النتيجة لأن الطلب غير مسند إليك بإسناد مقبول.",
  request_already_closed: "لا يمكن تسجيل النتيجة لأن الطلب مغلق بالفعل.",
  invalid_visit_outcome: "نتيجة الزيارة غير صحيحة.",
};

export default function VisitOutcomeControl({ requestId }: Props) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>("completed");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function saveOutcome() {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: outcomeError } = await supabase.rpc("technician_record_visit_outcome", {
      target_service_request_id: requestId,
      new_outcome: outcome,
      outcome_notes: notes.trim() || null,
    });

    if (outcomeError) {
      console.error("Record visit outcome error:", outcomeError);
      setError(ERROR_MESSAGES[outcomeError.message] ?? "تعذر تسجيل نتيجة الزيارة. حاول مرة أخرى.");
      setSaving(false);
      return;
    }

    setSaving(false);
    router.refresh();
  }

  return (
    <div className="technicianResponseControl">
      <select value={outcome} onChange={(event) => setOutcome(event.target.value as Outcome)} disabled={saving} aria-label="نتيجة الزيارة">
        {OUTCOMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="ملاحظات الزيارة (اختياري)" disabled={saving} />
      <button className="button primary compactButton" type="button" onClick={saveOutcome} disabled={saving}>
        {saving ? "جارٍ الحفظ..." : "تسجيل نتيجة الزيارة"}
      </button>
      {error ? <span className="inlineError" role="alert">{error}</span> : null}
    </div>
  );
}
