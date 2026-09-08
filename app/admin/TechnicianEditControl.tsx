"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SERVICE_OPTIONS = ["الكهرباء", "التكييف", "السباكة", "النجارة", "خدمات أخرى"];

type Props = {
  technicianId: string;
  initialServices: string[];
  initialActive: boolean;
  initialNotes: string | null;
};

export default function TechnicianEditControl({
  technicianId,
  initialServices,
  initialActive,
  initialNotes,
}: Props) {
  const router = useRouter();
  const [services, setServices] = useState<string[]>(initialServices);
  const [active, setActive] = useState(initialActive);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  function toggleService(service: string) {
    setServices((current) => current.includes(service) ? current.filter((item) => item !== service) : [...current, service]);
  }

  async function save() {
    if (!services.length) {
      setError("اختر خدمة واحدة على الأقل.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    const supabase = createClient();
    const { error: updateError } = await supabase.rpc("admin_update_technician", {
      target_technician_id: technicianId,
      target_service_types: services,
      target_is_active: active,
      target_notes: notes,
    });

    if (updateError) {
      setError("تعذر تحديث بيانات الفني.");
      setSaving(false);
      return;
    }

    setMessage("تم حفظ بيانات الفني.");
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="technicianEditControl">
      <button className="button secondary compactButton" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? "إغلاق" : "تعديل"}
      </button>
      {open ? (
        <div className="technicianEditPanel">
          <div className="serviceChoices">
            {SERVICE_OPTIONS.map((service) => (
              <label key={service}>
                <input type="checkbox" checked={services.includes(service)} onChange={() => toggleService(service)} />
                {service}
              </label>
            ))}
          </div>
          <label className="technicianActiveChoice">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            الفني نشط
          </label>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="ملاحظات الفني" />
          <button className="button primary compactButton" type="button" onClick={save} disabled={saving}>
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </button>
          {message ? <span className="inlineSuccess">{message}</span> : null}
          {error ? <span className="inlineError">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
