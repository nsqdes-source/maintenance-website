"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export default function ImageUploadField({ label, value, onChange }: { label: string; value: string | null; onChange: (url: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (!ALLOWED.has(file.type)) { setError("اختر صورة PNG أو JPG أو WebP."); return; }
    if (file.size > MAX_BYTES) { setError("يجب ألا يتجاوز حجم الصورة 5 ميغابايت."); return; }
    setUploading(true);
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `editor/${crypto.randomUUID()}.${extension}`;
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage.from("site-assets").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) setError("تعذر رفع الصورة. تحقق من صلاحيات مخزن الصور ثم حاول مرة أخرى.");
    else onChange(supabase.storage.from("site-assets").getPublicUrl(path).data.publicUrl);
    setUploading(false);
  }

  return <div className="siteImageField">
    <label>{label}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={event => void upload(event.target.files?.[0])} /></label>
    {uploading ? <small>جارٍ رفع الصورة...</small> : null}
    {value ? <div className="siteImagePreview"><img src={value} alt={label} /><button type="button" className="button secondary compactButton" onClick={() => onChange(null)}>إزالة الصورة</button></div> : null}
    {error ? <small className="inlineError" role="alert">{error}</small> : null}
    <small>احفظ تغييرات الموقع بعد رفع الصورة لتظهر للزوار.</small>
  </div>;
}
