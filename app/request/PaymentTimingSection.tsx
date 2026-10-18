"use client";

import { paymentTimingOptions, type PaymentTiming, type RequestPaymentPolicy } from "@/lib/request-payment-policy";

export default function PaymentTimingSection({ policy, choice, onChange, locale, hasVisit }: {
  policy: RequestPaymentPolicy;
  choice: PaymentTiming | null;
  onChange: (choice: PaymentTiming) => void;
  locale: string;
  hasVisit: boolean;
}) {
  if (!policy.configured || !policy.payment_domain_enabled || !policy.payment_policy) return null;
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
  const labels: Record<PaymentTiming, string> = {
    prepay: t("الدفع مقدمًا", "Pay in advance"),
    pay_on_arrival: t("الدفع عند وصول الفني", "Pay when the technician arrives"),
    pay_after_completion: t("الدفع بعد التنفيذ", "Pay after completion"),
  };
  const options = paymentTimingOptions(policy);
  return <fieldset className="requestPaymentTiming">
    <legend>{t("توقيت الدفع", "Payment timing")}</legend>
    {policy.payment_policy.original_timing === "customer_choice" ? options.map(option =>
      <label key={option}><input type="radio" name="payment_timing" value={option} checked={choice === option} onChange={() => onChange(option)} />{labels[option]}</label>
    ) : <p>{policy.payment_policy.original_timing === "prepay_required"
      ? t("يتطلب هذا الطلب الدفع مقدمًا.", "This request requires advance payment.")
      : options[0] ? labels[options[0]] : t("تعذر تحديد توقيت الدفع. أعد تحميل الصفحة.", "Payment timing is unavailable. Reload the page.")}</p>}
    {hasVisit && <p>{t("رسوم الفحص تُحتسب وفق السياسة ضمن العمل النهائي، وتبقى الرسوم المستحقة عند رفض العمل.", "Inspection fees follow the policy within final work; earned fees remain payable if work is declined.")}</p>}
  </fieldset>;
}
