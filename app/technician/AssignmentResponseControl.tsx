"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/app/components/LocaleContext";

type Props = { assignmentId: string };

export default function AssignmentResponseControl({ assignmentId }: Props) {
  const locale = useLocale();
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function respond(status: "accepted" | "rejected") {
    if (status === "rejected" && !notes.trim()) { setError(t("اكتب سبب الرفض أولًا.", "Please enter a reason for declining.")); return; }
    setSaving(true);
    setError("");

    const supabase = createClient();
    const { error: responseError } = await supabase.rpc("technician_respond_to_assignment", {
      target_assignment_id: assignmentId,
      new_status: status,
      response_notes: notes.trim() || null,
    });

    if (responseError) {
      setError(t("تعذر تحديث ردك على الإسناد.", "Could not update your response to this assignment."));
      setSaving(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="technicianResponseControl">
      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={2}
        placeholder={t("سبب الرفض مطلوب عند الرفض، والملاحظات اختيارية عند القبول", "A reason is required when declining; notes are optional when accepting.")}
        disabled={saving}
      />
      <div className="technicianResponseActions">
        <button className="button primary compactButton" type="button" onClick={() => respond("accepted")} disabled={saving}>
          {t("قبول الطلب", "Accept request")}
        </button>
        <button className="button secondary compactButton" type="button" onClick={() => respond("rejected")} disabled={saving}>
          {t("رفض الطلب", "Decline request")}
        </button>
      </div>
      {error ? <span className="inlineError">{error}</span> : null}
    </div>
  );
}
