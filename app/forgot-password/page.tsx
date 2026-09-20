"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/app/components/LocaleContext";

export default function ForgotPasswordPage() {
  const locale = useLocale();
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
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
      setError(t("يرجى إدخال بريد إلكتروني صحيح.", "Enter a valid email address."));
      setPending(false);
      return;
    }

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (resetError) {
      setError(t("تعذر إرسال رابط استعادة كلمة المرور. حاول مرة أخرى لاحقًا.", "Could not send a reset link. Please try again later."));
      setPending(false);
      return;
    }

    setMessage(t("إذا كان البريد مرتبطًا بحساب، فسيصلك رابط لاستعادة كلمة المرور. تحقق من البريد والرسائل غير المرغوب فيها.", "If this email belongs to an account, a password reset link will arrive. Check your inbox and spam folder."));
    setPending(false);
  }

  return (
    <main className="adminPage">
      <div className="adminLoginCard">
        <a className="backLink" href="/login">{t("← العودة لتسجيل الدخول", "← Back to sign in")}</a>
        <p className="eyebrow">{t("استعادة الحساب", "Account recovery")}</p>
        <h1>{t("نسيت كلمة المرور؟", "Forgot your password?")}</h1>
        <p className="adminIntro">{t("أدخل بريدك الإلكتروني وسنرسل لك رابطًا آمنًا لتعيين كلمة مرور جديدة.", "Enter your email and we will send you a secure password reset link.")}</p>

        <form className="request-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">{t("البريد الإلكتروني", "Email")}</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}
          {message && <div className="form-success" role="status">{message}</div>}

          <button className="button primary adminSubmit" type="submit" disabled={pending}>
            {pending ? t("جاري إرسال الرابط...", "Sending link...") : t("إرسال رابط الاستعادة", "Send reset link")}
          </button>
        </form>
      </div>
    </main>
  );
}
