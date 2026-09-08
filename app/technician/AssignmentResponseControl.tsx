"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = { assignmentId: string };

export default function AssignmentResponseControl({ assignmentId }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function respond(status: "accepted" | "rejected") {
    setSaving(true);
    setError("");

    const supabase = createClient();
    const { error: responseError } = await supabase.rpc("technician_respond_to_assignment", {
      target_assignment_id: assignmentId,
      new_status: status,
      response_notes: notes.trim() || null,
    });

    if (responseError) {
      setError("تعذر تحديث ردك على الإسناد.");
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
        placeholder="ملاحظات اختيارية"
        disabled={saving}
      />
      <div className="technicianResponseActions">
        <button className="button primary compactButton" type="button" onClick={() => respond("accepted")} disabled={saving}>
          قبول الطلب
        </button>
        <button className="button secondary compactButton" type="button" onClick={() => respond("rejected")} disabled={saving}>
          رفض الطلب
        </button>
      </div>
      {error ? <span className="inlineError">{error}</span> : null}
    </div>
  );
}
