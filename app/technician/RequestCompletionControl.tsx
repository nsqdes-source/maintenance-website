"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = { requestId: string };

const ERROR_MESSAGES: Record<string, string> = {
  technician_not_found: "لا يمكن إنهاء الطلب لأن حساب الفني غير نشط أو غير مرتبط بشكل صحيح.",
  accepted_assignment_not_found: "لا يمكن إنهاء الطلب لأن هذا الطلب ليس في حالة إسناد مقبول لهذا الفني.",
  service_request_not_found: "طلب الخدمة غير موجود.",
  request_already_closed: "لا يمكن إنهاء الطلب لأنه منتهي أو ملغي بالفعل.",
};

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
      console.error("Complete service request error:", completionError);
      const message = ERROR_MESSAGES[completionError.message] ?? "تعذر إنهاء طلب الخدمة. حاول مرة أخرى.";
      setError(message);
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
      {error ? <span className="inlineError" role="alert">{error}</span> : null}
    </div>
  );
}
