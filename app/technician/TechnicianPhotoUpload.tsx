"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Stage = "technician_arrival" | "technician_completion";

const STAGES: { value: Stage; label: string; hint: string }[] = [
  { value: "technician_arrival", label: "صور الزيارة الأولى", hint: "أرفق صورة واحدة على الأقل عند الوصول." },
  { value: "technician_completion", label: "صور بعد التنفيذ", hint: "صورة واحدة مطلوبة قبل تسجيل تم التنفيذ." },
];

function extension(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export default function TechnicianPhotoUpload({ requestId, technicianId }: { requestId: string; technicianId: string }) {
  const router = useRouter();
  const [busyStage, setBusyStage] = useState<Stage | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function upload(stage: Stage, files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    if (selected.length > 3) { setError("يمكن إرفاق ثلاث صور كحد أقصى في كل مرحلة."); return; }
    if (selected.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setError("الصور المقبولة JPEG أو PNG أو WebP وبحجم لا يتجاوز 5 ميجابايت."); return;
    }
    setBusyStage(stage); setError(""); setMessage("");
    const supabase = createClient();
    for (const file of selected) {
      const path = `${requestId}/${technicianId}/${stage}/${crypto.randomUUID()}.${extension(file)}`;
      const { error: uploadError } = await supabase.storage.from("request-images").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) { setError("تعذر رفع الصورة. حاول مرة أخرى."); setBusyStage(null); return; }
      const { error: attachError } = await supabase.rpc("technician_attach_service_request_image", {
        target_request_id: requestId, target_stage: stage, target_storage_path: path, target_content_type: file.type,
      });
      if (attachError) { setError("رُفعت الصورة لكن تعذر ربطها بالطلب."); setBusyStage(null); return; }
    }
    setBusyStage(null); setMessage("تم حفظ الصور في ملف الطلب."); router.refresh();
  }

  return <div className="technicianResponseControl" style={{ marginTop: 10 }}>
    {STAGES.map(stage => <label key={stage.value}>{stage.label}<small>{stage.hint}</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={Boolean(busyStage)} onChange={event => upload(stage.value, event.target.files)} /></label>)}
    {message ? <span className="inlineSuccess">{message}</span> : null}
    {error ? <span className="inlineError" role="alert">{error}</span> : null}
  </div>;
}
