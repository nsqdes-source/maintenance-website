"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const roles = new Set(["customer", "technician", "maintenance_manager", "admin_manager", "super_admin"]);

export default function EditAccountPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!user) {
        window.location.href = "/login";
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone, role")
        .eq("id", user.id)
        .maybeSingle();
      if (!mounted) return;
      setName(profile?.full_name ?? "");
      setPhone(profile?.phone ?? "");
      setEmail(user.email ?? "");
      setRole(profile?.role ?? null);
      setReady(true);
    }

    load();
    return () => { mounted = false; };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const normalizedPhone = phone.trim();
    if (!/^0\d{9}$/.test(normalizedPhone)) {
      setMessage("رقم الجوال يجب أن يتكون من 10 أرقام ويبدأ بـ 0.");
      return;
    }
    if (!name.trim()) {
      setMessage("يرجى إدخال الاسم.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: name.trim(), phone: normalizedPhone })
      .eq("id", user.id);

    if (profileError) {
      setSaving(false);
      setMessage("تعذر حفظ بيانات الحساب. حاول مرة أخرى.");
      return;
    }

    if (avatarFile) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(avatarFile.type) || avatarFile.size > 2 * 1024 * 1024) {
        setSaving(false); setMessage("الصورة الشخصية يجب أن تكون JPEG أو PNG أو WebP بحجم أقل من 2 ميجابايت."); return;
      }
      const extension = avatarFile.type === "image/png" ? "png" : avatarFile.type === "image/webp" ? "webp" : "jpg";
      const avatarPath = `${user.id}/avatar.${extension}`;
      const { error: avatarError } = await supabase.storage.from("avatars").upload(avatarPath, avatarFile, { upsert: true, contentType: avatarFile.type });
      if (avatarError) { setSaving(false); setMessage("تعذر رفع الصورة الشخصية."); return; }
      const { error: pathError } = await supabase.from("profiles").update({ avatar_path: avatarPath }).eq("id", user.id);
      if (pathError) { setSaving(false); setMessage("رُفعت الصورة لكن تعذر ربطها بالحساب."); return; }
    }

    if (email.trim() !== (user.email ?? "")) {
      const { error: emailError } = await supabase.auth.updateUser({ email: email.trim() });
      if (emailError) {
        setSaving(false);
        setMessage(`تم حفظ الاسم والجوال، لكن تعذر تحديث البريد الإلكتروني: ${emailError.message}`);
        return;
      }
    }

    setSaving(false);
    setMessage("تم حفظ بيانات الحساب بنجاح.");
    setTimeout(() => { window.location.href = "/"; }, 700);
  }

  if (!ready) return <main className="page"><section className="card"><p>جاري تحميل بيانات الحساب...</p></section></main>;

  return (
    <main className="page" dir="rtl">
      <section className="card" style={{ maxWidth: 620, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>تعديل المعلومات</h1>
        <p style={{ color: "#64748b" }}>يمكنك تحديث الاسم ورقم الجوال والبريد الإلكتروني.</p>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <label>الاسم<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label>رقم الجوال<input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" maxLength={10} required /></label>
          <label>البريد الإلكتروني<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>الصورة الشخصية<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)} /></label>
          {role && role !== "customer" ? <label>نوع الحساب<input value={roles.has(role) ? ({ technician: "فني", maintenance_manager: "مدير صيانة", admin_manager: "مدير إدارة", super_admin: "مدير النظام" } as Record<string, string>)[role] ?? "—" : "—"} readOnly /></label> : null}
          {message && <p role="status" style={{ margin: 0, color: "#475569" }}>{message}</p>}
          <button className="button primary" type="submit" disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ التغييرات"}</button>
        </form>
      </section>
    </main>
  );
}
