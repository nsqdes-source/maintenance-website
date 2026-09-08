"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const STATUS_OPTIONS = [
  { value: "new", label: "جديد" },
  { value: "contacted", label: "تم التواصل" },
  { value: "scheduled", label: "مجدول" },
  { value: "completed", label: "مكتمل" },
  { value: "cancelled", label: "ملغي" },
];

type RequestStatusControlProps = {
  requestId: string;
  initialStatus: string;
};

export default function RequestStatusControl({
  requestId,
  initialStatus,
}: RequestStatusControlProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSave() {
    setIsSaving(true);
    setMessage("");
    setError("");

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("service_requests")
      .update({ status })
      .eq("id", requestId);

    if (updateError) {
      setError("تعذر تحديث حالة الطلب.");
      setIsSaving(false);
      return;
    }

    setMessage("تم تحديث الحالة.");
    setIsSaving(false);
    router.refresh();
  }

  return (
    <div className="requestStatusControl">
      <div className="requestStatusRow">
        <label htmlFor={`status-${requestId}`}>حالة الطلب</label>
        <select
          id={`status-${requestId}`}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setMessage("");
            setError("");
          }}
          disabled={isSaving}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="button primary statusSaveButton" type="button" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "جارٍ الحفظ..." : "حفظ الحالة"}
        </button>
      </div>
      {message ? <p className="statusSuccess">{message}</p> : null}
      {error ? <p className="statusError">{error}</p> : null}
    </div>
  );
}
