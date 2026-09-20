"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/app/components/LocaleContext";

export default function LoginPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
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
      setError(t("بيانات الدخول غير صحيحة أو يجب تأكيد البريد الإلكتروني أولًا.", "The sign-in details are incorrect, or you need to confirm your email first."));
      setPending(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .maybeSingle();

    if (profile?.role === "technician") {
      router.push("/technician");
      return;
    }

    if (["maintenance_manager", "admin_manager", "super_admin"].includes(profile?.role ?? "")) {
      router.push("/admin");
      return;
    }

    router.push("/");
  }

  async function signInWithGoogle() {
    setPending(true);
    setError("");
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) {
      setError(t("تعذر بدء تسجيل الدخول عبر Google.", "Could not start Google sign-in."));
      setPending(false);
    }
  }
  return (
    <main className="authShell">
      <div className="authCard">
        <Link className="backLink" href="/">{t("← العودة للرئيسية", "← Back to home")}</Link>
        <p className="eyebrow">{t("حساب المستخدم", "User account")}</p>
        <h1>{t("تسجيل الدخول", "Sign in")}</h1>
        <p className="adminIntro">{t("سجّل الدخول للوصول إلى حسابك ولوحة العمل المناسبة لدورك.", "Sign in to access your account and work area.")}</p>

        <form className="request-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">{t("البريد الإلكتروني", "Email")}</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="form-group">
            <label htmlFor="password">{t("كلمة المرور", "Password")}</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}

          <button className="button primary adminSubmit" type="submit" disabled={pending}>
            {pending ? t("جاري تسجيل الدخول...", "Signing in...") : t("تسجيل الدخول", "Sign in")}
          </button>
        </form>

        <button type="button" className="button secondary adminSubmit" disabled={pending} onClick={signInWithGoogle}>{t("الدخول عبر Google", "Continue with Google")}</button>
        <p className="adminIntro"><Link href="/forgot-password">{t("نسيت كلمة المرور؟", "Forgot your password?")}</Link></p>
        <p className="adminIntro">{t("ليس لديك حساب؟ ", "No account yet? ")}<Link href="/register">{t("إنشاء حساب", "Create an account")}</Link></p>
      </div>
    </main>
  );
}
