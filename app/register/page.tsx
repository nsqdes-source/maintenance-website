"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/account`,
        data: {
          full_name: fullName.trim(),
          phone: phone.trim(),
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
            <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required autoComplete="tel" dir="ltr" />
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
