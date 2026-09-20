"use client";
import Link from "next/link";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/app/components/LocaleContext";

const phonePattern = /^0\d{9}$/;

export default function RegisterPage() {
  const locale = useLocale();
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setError("");

    const normalizedPhone = phone.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = fullName.trim();

    if (!normalizedName) {
      setError(t("يرجى إدخال الاسم.", "Enter your name."));
      setPending(false);
      return;
    }

    if (!phonePattern.test(normalizedPhone)) {
      setError(t("رقم الجوال يجب أن يتكون من 10 أرقام ويبدأ بـ 0.", "The phone number must have 10 digits and start with 0."));
      setPending(false);
      return;
    }

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t("يرجى إدخال بريد إلكتروني صحيح.", "Enter a valid email address."));
      setPending(false);
      return;
    }

    if (password.length < 8) {
      setError(t("كلمة المرور يجب ألا تقل عن 8 أحرف.", "Password must have at least 8 characters."));
      setPending(false);
      return;
    }

    const supabase = createClient();
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/account`,
        data: {
          full_name: normalizedName,
          phone: normalizedPhone,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message.includes("Database error saving new user") || signUpError.message.includes("already registered")
        ? t("تعذر إنشاء الحساب. قد يكون البريد الإلكتروني أو رقم الجوال مستخدمًا بالفعل. جرّب تسجيل الدخول أو استعادة كلمة المرور.", "Could not create the account. The email or phone may already be in use. Try signing in or resetting your password.")
        : t("تعذر إنشاء الحساب. تحقق من البيانات وحاول مرة أخرى.", "Could not create the account. Check your details and try again."));
      setPending(false);
      return;
    }

    if (!signUpData.user || signUpData.user.identities?.length === 0) {
      setError(t("إذا كان البريد الإلكتروني مستخدمًا بالفعل، فلن يُنشأ حساب جديد. جرّب تسجيل الدخول أو استعادة كلمة المرور.", "If this email is already in use, no new account was created. Try signing in or resetting your password."));
      setPending(false);
      return;
    }

    setMessage(t("تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيد الحساب ثم سجّل الدخول.", "Account created. Check your email to confirm it, then sign in."));
    setPending(false);
  }

  return (
    <main className="adminPage">
      <div className="adminLoginCard">
        <Link className="backLink" href="/">{t("← العودة للرئيسية", "← Back to home")}</Link>
        <p className="eyebrow">{t("حساب العميل", "Customer account")}</p>
        <h1>{t("إنشاء حساب", "Create account")}</h1>
        <p className="adminIntro">{t("أنشئ حسابًا لمتابعة طلبات الصيانة المرتبطة بك.", "Create an account to track your maintenance requests.")}</p>

        <form className="request-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="full_name">{t("الاسم", "Name")}</label>
            <input id="full_name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
          </div>
          <div className="form-group">
            <label htmlFor="phone">{t("رقم الجوال", "Phone number")}</label>
            <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} required autoComplete="tel" dir="ltr" inputMode="numeric" maxLength={10} placeholder="05xxxxxxxx" />
          </div>
          <div className="form-group">
            <label htmlFor="email">{t("البريد الإلكتروني", "Email")}</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="form-group">
            <label htmlFor="password">{t("كلمة المرور", "Password")}</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}


          <button className="button primary adminSubmit" type="submit" disabled={pending}>
            {pending ? t("جاري إنشاء الحساب...", "Creating account...") : "إنشاء الحساب"}
          </button>
        </form>

        <p className="adminIntro">{t("لديك حساب بالفعل؟ ", "Already have an account? ")}<Link href="/login">{t("تسجيل الدخول", "Sign in")}</Link></p>
      </div>
      {message ? <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,.48)", display: "grid", placeItems: "center", padding: 20 }}><div role="dialog" aria-modal="true" aria-labelledby="registration-success-title" className="card" style={{ maxWidth: 440, padding: 28 }}><h2 id="registration-success-title">{t("تم إنشاء الحساب", "Account created")}</h2><p>{message}</p><button type="button" className="button primary" onClick={() => { window.location.href = "/"; }}>{t("العودة للرئيسية", "Back to home")}</button></div></div> : null}
    </main>
  );
}
