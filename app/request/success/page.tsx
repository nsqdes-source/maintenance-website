import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, text } from "@/lib/locale";
import { requestReference } from "@/lib/request-reference";

export const metadata: Metadata = {
  title: "تم استلام الطلب | معين لخدمات الصيانة",
  description: "تم استلام طلب الخدمة لدى معين.",
};

export default async function RequestSuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = await getLocale();
  const t = (ar: string, en: string) => text(locale, ar, en);
  const query = await searchParams;
  const rawId = typeof query.id === "string" ? query.id : "";
  const requestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId) ? rawId : "";
  const partialUpload = query.upload === "partial";

  return <main className="request-page requestSuccessPage"><section className="request-success">
    <div className="successIcon" aria-hidden>✓</div>
    <p className="eyebrow">{t("تم استلام طلبك", "Request received")}</p>
    <h1>{t("شكرًا، طلبك الآن لدى فريق معين", "Thank you, your request is now with Mueen")}</h1>
    <p>{t("سنراجع التفاصيل ونتواصل معك لتأكيد الخدمة والموعد المبدئي.", "We will review the details and contact you to confirm the service and preliminary schedule.")}</p>
    {requestId ? <div className="requestIdBox"><span>{t("رقم الطلب", "Request ID")}</span><strong dir="ltr">{requestReference(requestId)}</strong><small>{t("احتفظ بهذا الرقم للرجوع إلى طلبك.", "Keep this number for future reference.")}</small></div> : null}
    {partialUpload ? <div className="form-notice" role="status">{t("تم إنشاء الطلب بنجاح. تعذر إرفاق صورة أو أكثر، ويمكنك إرسالها للفريق عند التواصل معك.", "Your request was created successfully. One or more images could not be attached; you can send them to our team when they contact you.")}</div> : null}
    <ol className="successJourney">
      <li><span>1</span><strong>{t("نراجع التفاصيل", "We review the details")}</strong></li>
      <li><span>2</span><strong>{t("نتواصل معك", "We contact you")}</strong></li>
      <li><span>3</span><strong>{t("نؤكد الخدمة والموعد", "We confirm the service and schedule")}</strong></li>
    </ol>
    <div className="successActions"><Link href="/" className="button primary">{t("العودة للرئيسية", "Back to home")}</Link><Link href="/services" className="button secondary">{t("استعراض الخدمات", "Browse services")}</Link></div>
  </section></main>;
}
