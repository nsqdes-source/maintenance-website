"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const phonePattern = /^0\d{9}$/;

export default function RegisterPage() {
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
      setError("يرجى إدخال الاسم.");
      setPending(false);
      return;
    }

    if (!phonePattern.test(normalizedPhone)) {
      setError("رقم الجوال يجب أن يتكون من 10 أرقام ويبدأ بـ 0.");
      setPending(false);
      return;
    }

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("يرجى إدخال بريد إلكتروني صحيح.");
      setPending(false);
      return;
    }

    if (password.length < 8) {
      setError("كلمة المرور يجب ألا تقل عن 8 أحرف.");
      setPending(false);
      return;
    }

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
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
      setError("تعذر إنشاء الحساب. تحقق من البيانات وحاول مرة أخرى.");
      setPending(false);
      return;
    }

    setMessage("تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيد الحساب ثم سجّل الدخول.");
    setPending(false);
  }

  return (
    <main className="adminPage">
      <div className="adminLoginCard">
        <a className="backLink" href="/">← العودة للرئيسية</a>
        <p className="eyebrow">حساب العميل</p>
        <h1>إنشاء حساب</h1>
        <p className="adminIntro">أنشئ حسابًا لمتابعة طلبات الصيانة المرتبطة بك.</p>

        <form className="request-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="full_name">الاسم</label>
            <input id="full_name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
          </div>
          <div className="form-group">
            <label htmlFor="phone">رقم الجوال</label>
            <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} required autoComplete="tel" dir="ltr" inputMode="numeric" maxLength={10} placeholder="05xxxxxxxx" />
          </div>
          <div className="form-group">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="form-group">
            <label htmlFor="password">كلمة المرور</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}
          {message && <div className="form-success" role="status">{message}</div>}

          <button className="button primary adminSubmit" type="submit" disabled={pending}>
            {pending ? "جاري إنشاء الحساب..." : "إنشاء الحساب"}
          </button>
        </form>

        <p className="adminIntro">لديك حساب بالفعل؟ <a href="/login">تسجيل الدخول</a></p>
      </div>
    </main>
  );
}
