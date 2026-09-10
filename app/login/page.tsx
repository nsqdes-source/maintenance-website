"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError("بيانات الدخول غير صحيحة أو يجب تأكيد البريد الإلكتروني أولًا.");
      setPending(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .maybeSingle();

    if (profile?.role === "technician") {
      window.location.href = "/technician";
      return;
    }

    if (["maintenance_manager", "admin_manager", "super_admin"].includes(profile?.role ?? "")) {
      window.location.href = "/admin";
      return;
    }

    window.location.href = "/";
  }

  return (
    <main className="adminPage">
      <div className="adminLoginCard">
        <a className="backLink" href="/">← العودة للرئيسية</a>
        <p className="eyebrow">حساب المستخدم</p>
        <h1>تسجيل الدخول</h1>
        <p className="adminIntro">سجّل الدخول للوصول إلى حسابك ولوحة العمل المناسبة لدورك.</p>

        <form className="request-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="form-group">
            <label htmlFor="password">كلمة المرور</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}

          <button className="button primary adminSubmit" type="submit" disabled={pending}>
            {pending ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
          </button>
        </form>

        <p className="adminIntro"><a href="/forgot-password">نسيت كلمة المرور؟</a></p>
        <p className="adminIntro">ليس لديك حساب؟ <a href="/register">إنشاء حساب</a></p>
      </div>
    </main>
  );
}
