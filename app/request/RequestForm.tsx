"use client";

import { useActionState } from "react";
import { submitServiceRequest } from "./actions";

const initialState = { success: false, message: "" };

export default function RequestForm() {
  const [state, formAction, pending] = useActionState(submitServiceRequest, initialState);

  if (state.success) {
    return (
      <div className="request-success">
        <h2>تم إرسال الطلب</h2>
        <p>{state.message}</p>
        <a href="/" className="button primary">العودة للرئيسية</a>
      </div>
    );
  }

  return (
    <form action={formAction} className="request-form">
      <div className="form-group">
        <label htmlFor="customer_name">الاسم *</label>
        <input id="customer_name" name="customer_name" type="text" required placeholder="اكتب اسمك" />
      </div>

      <div className="form-group">
        <label htmlFor="phone">رقم الجوال *</label>
        <input id="phone" name="phone" type="tel" required placeholder="05xxxxxxxx" dir="ltr" />
      </div>

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
        <input id="city" name="city" type="text" required placeholder="مثال: مكة المكرمة" />
      </div>

      <div className="form-group">
        <label htmlFor="address">العنوان *</label>
        <textarea id="address" name="address" required rows={3} placeholder="الحي، الشارع، رقم المبنى..." />
      </div>

      {state.message && <div className="form-error" role="alert">{state.message}</div>}

      <button type="submit" className="button primary" disabled={pending}>
        {pending ? "جاري إرسال الطلب..." : "إرسال طلب الخدمة"}
      </button>
    </form>
  );
}
