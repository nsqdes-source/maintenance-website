"use client";
import Link from "next/link";

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

  async function signInWithGoogle() {
    setPending(true);
    setError("");
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) {
      setError("تعذر بدء تسجيل الدخول عبر Google.");
      setPending(false);
    }
  }
  return (
    <main className="adminPage">
      <div className="adminLoginCard">
        <Link className="backLink" href="/">← العودة للرئيسية</Link>
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

        <button type="button" className="button secondary adminSubmit" disabled={pending} onClick={signInWithGoogle}>الدخول عبر Google</button>
        <p className="adminIntro"><Link href="/forgot-password">نسيت كلمة المرور؟</Link></p>
        <p className="adminIntro">ليس لديك حساب؟ <Link href="/register">إنشاء حساب</Link></p>
      </div>
    </main>
  );
}
