"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const NEXT_STAGE: Record<string, { value: string; label: string }> = {
  technician_accepted: { value: "in_progress", label: "بدء التنفيذ" },
  needs_followup: { value: "awaiting_admin_quote", label: "إعداد عرض الإصلاح" },
  quote_approved: { value: "in_progress", label: "استئناف التنفيذ" },
};

export default function WorkflowAdvanceControl({ requestId, stage }: { requestId: string; stage: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = NEXT_STAGE[stage];
  if (!next) return null;

  async function advance() {
    setBusy(true);
    setError("");
    const { error: resultError } = await createClient().rpc("admin_advance_service_request", {
      target_service_request_id: requestId,
      new_stage: next.value,
    });
    setBusy(false);
    if (resultError) {
      setError("تعذر تحديث مرحلة الطلب.");
      return;
    }
    router.refresh();
  }

  return <div>
    <button type="button" className="button primary compactButton" disabled={busy} onClick={advance}>
      {busy ? "جارٍ التحديث..." : next.label}
    </button>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>;
}
