"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/app/components/LocaleContext";

type Outcome = "completed" | "needs_followup" | "reschedule_requested" | "unable_to_complete";
type Props = { requestId: string };

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: "completed", label: "تم التنفيذ" },
  { value: "needs_followup", label: "قطع ومواد / تعديل" },
  { value: "reschedule_requested", label: "طلب إعادة جدولة" },
  { value: "unable_to_complete", label: "تعذر التنفيذ" },
];

const ERROR_MESSAGES: Record<string, string> = {
  technician_not_found: "لا يمكن تسجيل نتيجة الزيارة لأن حساب الفني غير نشط أو غير مرتبط بشكل صحيح.",
  accepted_assignment_not_found: "لا يمكن تسجيل النتيجة لأن الطلب غير مسند إليك بإسناد مقبول.",
  request_already_closed: "لا يمكن تسجيل النتيجة لأن الطلب مغلق بالفعل.",
  invalid_visit_outcome: "نتيجة الزيارة غير صحيحة.",
};

export default function VisitOutcomeControl({ requestId }: Props) {
  const locale = useLocale();
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
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
      setError(ERROR_MESSAGES[outcomeError.message] ?? t("تعذر تسجيل نتيجة الزيارة. حاول مرة أخرى.", "Could not save the visit outcome. Try again."));
      setSaving(false);
      return;
    }

    setSaving(false);
    router.refresh();
  }

  return (
    <div className="technicianResponseControl">
      <select value={outcome} onChange={(event) => setOutcome(event.target.value as Outcome)} disabled={saving} aria-label={t("نتيجة الزيارة", "Visit outcome")}>
        {OUTCOMES.map((item) => <option key={item.value} value={item.value}>{locale === "en" ? ({ completed: "Completed", needs_followup: "Parts/materials or changes", reschedule_requested: "Request rescheduling", unable_to_complete: "Unable to complete" } as Record<Outcome, string>)[item.value] : item.label}</option>)}
      </select>
      <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder={t("ملاحظات الزيارة (اختياري)", "Visit notes (optional)")} disabled={saving} />
      <button className="button primary compactButton" type="button" onClick={saveOutcome} disabled={saving}>
        {saving ? t("جارٍ الحفظ...", "Saving...") : t("تسجيل نتيجة الزيارة", "Save visit outcome")}
      </button>
      {error ? <span className="inlineError" role="alert">{error}</span> : null}
    </div>
  );
}
