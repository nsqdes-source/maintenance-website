"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/app/components/LocaleContext";

export default function UpdatePasswordPage() {
  const locale = useLocale();
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const recoveryCookie = "password_recovery_pending=1; Path=/; Max-Age=1800; SameSite=Lax";
    const clearRecoveryCookie = "password_recovery_pending=; Path=/; Max-Age=0; SameSite=Lax";

    async function prepareRecovery() {
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          // createBrowserClient may already have exchanged the PKCE recovery code.
          // In that case the one-time code is consumed, but the recovery session is valid.
          const { data: { session: recoveredSession } } = await supabase.auth.getSession();
          if (recoveredSession) {
            if (active) {
              document.cookie = recoveryCookie;
              window.history.replaceState({}, document.title, window.location.pathname);
              setReady(true);
              setChecking(false);
            }
            return;
          }

          if (active) {
            setError(t("رابط الاستعادة غير صالح أو منتهي. اطلب رابطًا جديدًا.", "The recovery link is invalid or expired. Request a new one."));
            setChecking(false);
          }
          return;
        }
        document.cookie = recoveryCookie;
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;

      const recoveryPending = document.cookie
        .split("; ")
        .some((item) => item === "password_recovery_pending=1");

      setReady(Boolean(session) && recoveryPending);
      if (!session || !recoveryPending) {
        document.cookie = clearRecoveryCookie;
        setError(t("لا توجد جلسة استعادة صالحة. اطلب رابطًا جديدًا من صفحة استعادة كلمة المرور.", "No valid recovery session. Request a new link from the password recovery page."));
      }
      setChecking(false);
    }

    prepareRecovery();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (password.length < 8) {
      setError(t("كلمة المرور يجب ألا تقل عن 8 أحرف.", "Password must have at least 8 characters."));
      return;
    }

    if (password !== confirmation) {
      setError(t("تأكيد كلمة المرور غير متطابق.", "Passwords do not match."));
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(t("تعذر تحديث كلمة المرور. قد تكون جلسة الاستعادة منتهية، اطلب رابطًا جديدًا.", "Could not update your password. The recovery session may have expired; request a new link."));
      setPending(false);
      return;
    }

    document.cookie = "password_recovery_pending=; Path=/; Max-Age=0; SameSite=Lax";
    await supabase.auth.signOut({ scope: "local" });
    window.location.href = "/login";
  }

  return (
    <main className="adminPage">
      <div className="adminLoginCard">
        <a className="backLink" href="/login">{t("← العودة لتسجيل الدخول", "← Back to sign in")}</a>
        <p className="eyebrow">{t("استعادة الحساب", "Account recovery")}</p>
        <h1>{t("تعيين كلمة مرور جديدة", "Set a new password")}</h1>
        <p className="adminIntro">{t("اختر كلمة مرور جديدة لا تقل عن 8 أحرف.", "Choose a new password with at least 8 characters.")}</p>

        {checking ? (
          <div className="form-success" role="status">{t("جاري التحقق من رابط الاستعادة...", "Checking recovery link...")}</div>
        ) : ready ? (
          <form className="request-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="password">{t("كلمة المرور الجديدة", "New password")}</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" autoFocus />
            </div>
            <div className="form-group">
              <label htmlFor="confirmation">{t("تأكيد كلمة المرور", "Confirm password")}</label>
              <input id="confirmation" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required minLength={8} autoComplete="new-password" />
            </div>

            {error && <div className="form-error" role="alert">{error}</div>}
            {message && <div className="form-success" role="status">{message}</div>}

            <button className="button primary adminSubmit" type="submit" disabled={pending}>
              {pending ? t("جاري تحديث كلمة المرور...", "Updating password...") : t("تحديث كلمة المرور", "Update password")}
            </button>
          </form>
        ) : (
          <>
            {error && <div className="form-error" role="alert">{error}</div>}
            {message && <div className="form-success" role="status">{message}</div>}
            <a className="button primary adminSubmit" href="/forgot-password">{t("طلب رابط جديد", "Request a new link")}</a>
          </>
        )}
      </div>
    </main>
  );
}
