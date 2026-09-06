"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type FormStatus = {
  success: boolean;
  message: string;
};

export default function RequestForm() {
  const [status, setStatus] = useState<FormStatus>({
    success: false,
    message: "",
  });
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    setPending(true);
    setStatus({ success: false, message: "" });

    const formData = new FormData(form);

    const customerName = String(formData.get("customer_name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const serviceType = String(formData.get("service_type") ?? "").trim();
    const problemDescription = String(
      formData.get("problem_description") ?? ""
    ).trim();
    const city = String(formData.get("city") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();

    if (
      !customerName ||
      !phone ||
      !serviceType ||
      !problemDescription ||
      !city ||
      !address
    ) {
      setStatus({
        success: false,
        message: "يرجى تعبئة جميع الحقول المطلوبة.",
      });
      setPending(false);
      return;
    }

    const supabase = createClient();

    const { error } = await supabase.from("service_requests").insert({
      customer_name: customerName,
      phone,
      service_type: serviceType,
      problem_description: problemDescription,
      city,
      address,
    });

    if (error) {
      console.error("Service request error:", error);
      setStatus({
        success: false,
        message: "تعذر إرسال الطلب حاليًا. يرجى المحاولة مرة أخرى.",
      });
      setPending(false);
      return;
    }

    setStatus({
      success: true,
      message: "تم استلام طلبك بنجاح. سنتواصل معك قريبًا.",
    });
    setPending(false);
    form.reset();
  }

  if (status.success) {
    return (
      <div className="request-success">
        <h2>تم إرسال الطلب</h2>
        <p>{status.message}</p>
        <a href="/" className="button primary">
          العودة للرئيسية
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="request-form">
      <div className="form-group">
        <label htmlFor="customer_name">الاسم *</label>
        <input
          id="customer_name"
          name="customer_name"
          type="text"
          required
          placeholder="اكتب اسمك"
        />
      </div>

      <div className="form-group">
        <label htmlFor="phone">رقم الجوال *</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          placeholder="05xxxxxxxx"
          dir="ltr"
        />
      </div>

      <div className="form-group">
        <label htmlFor="service_type">نوع الخدمة *</label>
        <select
          id="service_type"
          name="service_type"
          required
          defaultValue=""
        >
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
        <textarea
          id="problem_description"
          name="problem_description"
          required
          rows={5}
          placeholder="اشرح لنا المشكلة بالتفصيل"
        />
      </div>

      <div className="form-group">
        <label htmlFor="city">المدينة *</label>
        <input
          id="city"
          name="city"
          type="text"
          required
          placeholder="مثال: مكة المكرمة"
        />
      </div>

      <div className="form-group">
        <label htmlFor="address">العنوان *</label>
        <textarea
          id="address"
          name="address"
          required
          rows={3}
          placeholder="الحي، الشارع، رقم المبنى..."
        />
      </div>

      {status.message && (
        <div className="form-error" role="alert">
          {status.message}
        </div>
      )}

      <button type="submit" className="button primary" disabled={pending}>
        {pending ? "جاري إرسال الطلب..." : "إرسال طلب الخدمة"}
      </button>
    </form>
  );
}
