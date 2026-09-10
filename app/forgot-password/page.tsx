"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("يرجى إدخال بريد إلكتروني صحيح.");
      setPending(false);
      return;
    }

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (resetError) {
      setError("تعذر إرسال رابط استعادة كلمة المرور. حاول مرة أخرى لاحقًا.");
      setPending(false);
      return;
    }

    setMessage("إذا كان البريد مرتبطًا بحساب، فسيصلك رابط لاستعادة كلمة المرور. تحقق من البريد والرسائل غير المرغوب فيها.");
    setPending(false);
  }

  return (
    <main className="adminPage">
      <div className="adminLoginCard">
        <a className="backLink" href="/login">← العودة لتسجيل الدخول</a>
        <p className="eyebrow">استعادة الحساب</p>
        <h1>نسيت كلمة المرور؟</h1>
        <p className="adminIntro">أدخل بريدك الإلكتروني وسنرسل لك رابطًا آمنًا لتعيين كلمة مرور جديدة.</p>

        <form className="request-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}
          {message && <div className="form-success" role="status">{message}</div>}

          <button className="button primary adminSubmit" type="submit" disabled={pending}>
            {pending ? "جاري إرسال الرابط..." : "إرسال رابط الاستعادة"}
          </button>
        </form>
      </div>
    </main>
  );
}
