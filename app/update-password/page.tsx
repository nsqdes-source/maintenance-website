"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
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

    async function prepareRecovery() {
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (active) {
            setError("رابط الاستعادة غير صالح أو منتهي. اطلب رابطًا جديدًا.");
            setChecking(false);
          }
          return;
        }
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;

      setReady(Boolean(session));
      if (!session) {
        setError("لا توجد جلسة استعادة صالحة. اطلب رابطًا جديدًا من صفحة استعادة كلمة المرور.");
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
      setError("كلمة المرور يجب ألا تقل عن 8 أحرف.");
      return;
    }

    if (password !== confirmation) {
      setError("تأكيد كلمة المرور غير متطابق.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError("تعذر تحديث كلمة المرور. قد تكون جلسة الاستعادة منتهية، اطلب رابطًا جديدًا.");
      setPending(false);
      return;
    }

    await supabase.auth.signOut();
    setPassword("");
    setConfirmation("");
    setMessage("تم تحديث كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.");
    setReady(false);
    setPending(false);
  }

  return (
    <main className="adminPage">
      <div className="adminLoginCard">
        <a className="backLink" href="/login">← العودة لتسجيل الدخول</a>
        <p className="eyebrow">استعادة الحساب</p>
        <h1>تعيين كلمة مرور جديدة</h1>
        <p className="adminIntro">اختر كلمة مرور جديدة لا تقل عن 8 أحرف.</p>

        {checking ? (
          <div className="form-success" role="status">جاري التحقق من رابط الاستعادة...</div>
        ) : ready ? (
          <form className="request-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="password">كلمة المرور الجديدة</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" autoFocus />
            </div>
            <div className="form-group">
              <label htmlFor="confirmation">تأكيد كلمة المرور</label>
              <input id="confirmation" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required minLength={8} autoComplete="new-password" />
            </div>

            {error && <div className="form-error" role="alert">{error}</div>}
            {message && <div className="form-success" role="status">{message}</div>}

            <button className="button primary adminSubmit" type="submit" disabled={pending}>
              {pending ? "جاري تحديث كلمة المرور..." : "تحديث كلمة المرور"}
            </button>
          </form>
        ) : (
          <>
            {error && <div className="form-error" role="alert">{error}</div>}
            {message && <div className="form-success" role="status">{message}</div>}
            <a className="button primary adminSubmit" href="/forgot-password">طلب رابط جديد</a>
          </>
        )}
      </div>
    </main>
  );
}
