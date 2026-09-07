"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError("بيانات الدخول غير صحيحة أو لا يمكن تسجيل الدخول حاليًا.");
      setPending(false);
      return;
    }

    window.location.href = "/admin";
  }

  return (
    <main className="adminPage">
      <div className="adminLoginCard">
        <a className="backLink" href="/">← العودة للرئيسية</a>
        <p className="eyebrow">منطقة الإدارة</p>
        <h1>تسجيل دخول الإدارة</h1>
        <p className="adminIntro">استخدم حساب Supabase المخصص للإدارة للوصول إلى طلبات الخدمة.</p>
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
            {pending ? "جاري الدخول..." : "تسجيل الدخول"}
          </button>
        </form>
      </div>
    </main>
  );
}
