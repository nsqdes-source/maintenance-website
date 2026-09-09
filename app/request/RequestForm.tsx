"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type FormStatus = {
  success: boolean;
  message: string;
};

type CustomerProfile = {
  full_name: string | null;
  phone: string | null;
};

const phonePattern = /^0\d{9}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cities = ["مكة المكرمة", "جدة", "الطائف"];

export default function RequestForm() {
  const [status, setStatus] = useState<FormStatus>({ success: false, message: "" });
  const [pending, setPending] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [profile, setProfile] = useState<CustomerProfile>({ full_name: null, phone: null });

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (!active) return;

      if (userError) {
        console.error("Auth user lookup error:", userError);
        setUserId(null);
        setUserEmail("");
        setLoadingUser(false);
        return;
      }

      setUserId(user?.id ?? null);
      setUserEmail(user?.email ?? "");

      if (user) {
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Customer profile lookup error:", profileError);
        }

        if (active && data) setProfile(data);
      }

      setLoadingUser(false);
    }

    loadUser();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    setPending(true);
    setStatus({ success: false, message: "" });

    const formData = new FormData(form);
    const customerName = userId ? (profile.full_name ?? "").trim() : String(formData.get("customer_name") ?? "").trim();
    const phone = userId ? (profile.phone ?? "").trim() : String(formData.get("phone") ?? "").trim();
    const email = userId ? userEmail.trim().toLowerCase() : String(formData.get("customer_email") ?? "").trim().toLowerCase();
    const serviceType = String(formData.get("service_type") ?? "").trim();
    const problemDescription = String(formData.get("problem_description") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();

    if (!customerName || !phone || !email || !serviceType || !problemDescription || !city || !address) {
      setStatus({ success: false, message: "يرجى تعبئة جميع الحقول المطلوبة." });
      setPending(false);
      return;
    }

    if (userId && (!profile.full_name?.trim() || !phonePattern.test(profile.phone ?? "") || !emailPattern.test(email))) {
      setStatus({ success: false, message: "بيانات حسابك غير مكتملة أو غير صحيحة. حدّث بيانات الحساب أولًا ثم أعد إرسال الطلب." });
      setPending(false);
      return;
    }

    if (!phonePattern.test(phone)) {
      setStatus({ success: false, message: "رقم الجوال يجب أن يتكون من 10 أرقام ويبدأ بـ 0." });
      setPending(false);
      return;
    }

    if (!emailPattern.test(email)) {
      setStatus({ success: false, message: "يرجى إدخال بريد إلكتروني صحيح." });
      setPending(false);
      return;
    }

    if (!cities.includes(city)) {
      setStatus({ success: false, message: "يرجى اختيار مدينة صحيحة من القائمة." });
      setPending(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("service_requests").insert({
      customer_name: customerName,
      phone,
      customer_email: email,
      service_type: serviceType,
      problem_description: problemDescription,
      city,
      address,
      customer_id: userId,
    });

    if (error) {
      console.error("Service request error:", error);
      setStatus({ success: false, message: "تعذر إرسال الطلب حاليًا. يرجى المحاولة مرة أخرى." });
      setPending(false);
      return;
    }

    setStatus({ success: true, message: "تم استلام طلبك بنجاح. سنتواصل معك قريبًا." });
    setPending(false);
    if (!userId) form.reset();
  }

  if (status.success) {
    return (
      <div className="request-success">
        <h2>تم إرسال الطلب</h2>
        <p>{status.message}</p>
        <a href="/" className="button primary">العودة للرئيسية</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="request-form">
      {!userId && !loadingUser && (
        <>
          <div className="form-group">
            <label htmlFor="customer_name">الاسم *</label>
            <input id="customer_name" name="customer_name" type="text" required placeholder="اكتب اسمك" autoComplete="name" />
          </div>
          <div className="form-group">
            <label htmlFor="phone">رقم الجوال *</label>
            <input id="phone" name="phone" type="tel" required placeholder="05xxxxxxxx" autoComplete="tel" dir="ltr" inputMode="numeric" maxLength={10} pattern="0[0-9]{9}" title="يجب أن يتكون رقم الجوال من 10 أرقام ويبدأ بـ 0" />
          </div>
          <div className="form-group">
            <label htmlFor="customer_email">البريد الإلكتروني *</label>
            <input id="customer_email" name="customer_email" type="email" required placeholder="name@example.com" autoComplete="email" />
          </div>
        </>
      )}

      {userId && !loadingUser && (
        <fieldset className="form-group" disabled={pending}>
          <legend>بيانات العميل</legend>
          <div className="form-group">
            <label htmlFor="account_customer_name">الاسم</label>
            <input
              id="account_customer_name"
              type="text"
              value={profile.full_name ?? ""}
              readOnly
              aria-readonly="true"
            />
          </div>
          <div className="form-group">
            <label htmlFor="account_phone">رقم الجوال</label>
            <input
              id="account_phone"
              type="tel"
              value={profile.phone ?? ""}
              readOnly
              aria-readonly="true"
              dir="ltr"
            />
          </div>
          <div className="form-group">
            <label htmlFor="account_email">البريد الإلكتروني</label>
            <input
              id="account_email"
              type="email"
              value={userEmail}
              readOnly
              aria-readonly="true"
              dir="ltr"
            />
          </div>
          {!profile.full_name || !phonePattern.test(profile.phone ?? "") || !emailPattern.test(userEmail) ? (
            <p className="form-hint">بيانات الحساب غير مكتملة. حدّث بيانات الحساب أولًا قبل إرسال الطلب.</p>
          ) : (
            <p className="form-hint">هذه البيانات مأخوذة من حسابك ولا يمكن تعديلها داخل طلب الخدمة.</p>
          )}
        </fieldset>
      )}

      <div className="form-group">
        <label htmlFor="service_type">نوع الخدمة *</label>
        <select id="service_type" name="service_type" required defaultValue="">
          <option value="">اختر نوع الخدمة</option>
          <option value="الكهرباء">الكهرباء</option>
          <option value="التكييف">التكييف</option>
          <option value="السباكة">السباكة</option>
          <option value="النجارة">النجارة</option>
          <option value="خدمات أخرى">خدمات أخرى</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="problem_description">وصف المشكلة *</label>
        <textarea id="problem_description" name="problem_description" required rows={5} placeholder="اشرح لنا المشكلة بالتفصيل" />
      </div>

      <div className="form-group">
        <label htmlFor="city">المدينة *</label>
        <select id="city" name="city" required defaultValue="">
          <option value="">اختر المدينة</option>
          {cities.map((city) => <option key={city} value={city}>{city}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="address">العنوان *</label>
        <textarea id="address" name="address" required rows={3} placeholder="الحي، الشارع، رقم المبنى..." />
      </div>

      {status.message && <div className={status.success ? "form-success" : "form-error"} role="alert">{status.message}</div>}

      <button type="submit" className="button primary" disabled={pending || loadingUser}>
        {loadingUser ? "جاري تحميل بيانات الحساب..." : pending ? "جاري إرسال الطلب..." : "إرسال طلب الخدمة"}
      </button>
    </form>
  );
}
