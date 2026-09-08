"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TechnicianOption = {
  id: string;
  name: string;
  phone: string | null;
  serviceTypes: string[];
};

type Props = {
  requestId: string;
  serviceType: string;
  technicians: TechnicianOption[];
  currentTechnicianId: string | null;
};

export default function RequestTechnicianControl({
  requestId,
  serviceType,
  technicians,
  currentTechnicianId,
}: Props) {
  const router = useRouter();
  const [technicianId, setTechnicianId] = useState(currentTechnicianId ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const sortedTechnicians = [...technicians].sort((a, b) => {
    const aMatch = a.serviceTypes.includes(serviceType) ? 0 : 1;
    const bMatch = b.serviceTypes.includes(serviceType) ? 0 : 1;
    return aMatch - bMatch || a.name.localeCompare(b.name, "ar");
  });

  async function assign() {
    if (!technicianId) {
      setError("اختر فنيًا أولًا.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    const supabase = createClient();
    const { error: assignError } = await supabase.rpc("admin_assign_service_request", {
      target_service_request_id: requestId,
      target_technician_id: technicianId,
    });

    if (assignError) {
      setError("تعذر إسناد الطلب للفني.");
      setSaving(false);
      return;
    }

    setMessage("تم إسناد الطلب.");
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="requestTechnicianControl">
      <select
        value={technicianId}
        onChange={(event) => {
          setTechnicianId(event.target.value);
          setMessage("");
          setError("");
        }}
        disabled={saving || sortedTechnicians.length === 0}
        aria-label={`الفني لطلب ${requestId}`}
      >
        <option value="">{sortedTechnicians.length ? "اختر الفني" : "لا يوجد فنيون نشطون"}</option>
        {sortedTechnicians.map((technician) => (
          <option key={technician.id} value={technician.id}>
            {technician.name}{technician.serviceTypes.includes(serviceType) ? " — مناسب للخدمة" : ""}
          </option>
        ))}
      </select>
      <button className="button primary compactButton" type="button" onClick={assign} disabled={saving || !technicianId}>
        {saving ? "جارٍ الإسناد..." : technicianId === currentTechnicianId ? "حفظ الإسناد" : "إسناد"}
      </button>
      {message ? <span className="inlineSuccess">{message}</span> : null}
      {error ? <span className="inlineError">{error}</span> : null}
    </div>
  );
}
