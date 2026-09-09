"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = { requestId: string };

export default function RequestCompletionControl({ requestId }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function completeRequest() {
    setSaving(true);
    setError("");

    const supabase = createClient();
    const { error: completionError } = await supabase.rpc("technician_complete_service_request", {
      target_service_request_id: requestId,
    });

    if (completionError) {
      setError("تعذر إنهاء طلب الخدمة.");
      setSaving(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="technicianCompletionControl">
      <button
        className="button primary compactButton"
        type="button"
        onClick={completeRequest}
        disabled={saving}
      >
        {saving ? "جارٍ الحفظ..." : "تم الانتهاء من الطلب"}
      </button>
      {error ? <span className="inlineError">{error}</span> : null}
    </div>
  );
}
