import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, text } from "@/lib/locale";
import { serviceCatalog } from "./service-content";
import SiteFooter from "@/app/components/SiteFooter";

export const metadata: Metadata = {
  title: "خدمات معين للصيانة في مكة | تكييف وسباكة وكهرباء ونجارة",
  description: "استعرض خدمات معين للتكييف والسباكة والكهرباء والنجارة في مكة، واختر الخدمة المناسبة ثم أرسل طلبك بسهولة.",
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => text(locale, ar, en);

  return (
    <main className="serviceHub">
      <section className="serviceHubHero">
        <div className="container">
          <Link className="backLink" href="/">{t("← العودة للرئيسية", "← Back to home")}</Link>
          <div className="serviceHubHeroGrid">
            <div><p className="eyebrow">{t("خدمات معين", "Mueen services")}</p><h1>{t("الصيانة التي تحتاجها، بخطوات واضحة", "The maintenance you need, with clear steps")}</h1><p>{t("اختر نوع الخدمة، تعرف على نطاقها، ثم أرسل طلبك. نراجع التفاصيل ونوضح المطلوب والتكلفة قبل التنفيذ.", "Choose a service, understand its scope, then submit your request. We review the details and explain the work and cost before starting.")}</p><div className="actions"><Link className="button primary largeButton" href="/request">{t("اطلب خدمة", "Request service")}</Link><Link className="button secondary largeButton" href="#service-list">{t("استعرض الخدمات", "Explore services")}</Link></div></div>
            <aside className="serviceHubPromise"><strong>{t("معين.. الصيانة أسهل", "Mueen makes maintenance easier")}</strong><span>✓ {t("موعد منظم", "Organized appointment")}</span><span>✓ {t("تكلفة واضحة", "Clear cost")}</span><span>✓ {t("موافقتك أولًا", "Your approval first")}</span><span>✓ {t("متابعة من معين", "Follow-up by Mueen")}</span></aside>
          </div>
        </div>
      </section>

      <section id="service-list" className="section serviceHubList"><div className="container"><div className="sectionHeading"><div><p className="eyebrow">{t("اختر خدمتك", "Choose your service")}</p><h2>{t("أربع خدمات أساسية للمنزل", "Four essential home services")}</h2></div><p className="sectionIntro">{t("التكييف هو خدمتنا الرئيسية عند الإطلاق، مع خدمات السباكة والكهرباء والنجارة ضمن النطاق الموضح في كل صفحة.", "Air conditioning is our lead launch service, alongside plumbing, electrical and carpentry within each page's stated scope.")}</p></div><div className="serviceHubGrid">{serviceCatalog.map((service, index) => <article className={service.slug === "ac" ? "featured" : ""} key={service.slug}>{service.slug === "ac" ? <span className="leadBadge">{t("الخدمة الرئيسية", "Lead service")}</span> : null}<div className="serviceHubIcon" aria-hidden>{service.icon}</div><span className="serviceNumber">{String(index + 1).padStart(2, "0")}</span><h2>{t(service.name.ar, service.name.en)}</h2><p>{t(service.description.ar, service.description.en)}</p><div className="serviceHubActions"><Link className="button secondary" href={`/services/${service.slug}`}>{t("تفاصيل الخدمة", "Service details")}</Link><Link className="cardLink" href="/request">{t("اطلب الآن ←", "Request now →")}</Link></div></article>)}</div></div></section>

      <section className="section serviceHubProcess"><div className="container"><div className="sectionHeading centered"><p className="eyebrow">{t("رحلة خدمة واضحة", "A clear service journey")}</p><h2>{t("نراجع، نوضح، ثم ننفذ بعد موافقتك", "We review, explain, then proceed after approval")}</h2><p className="sectionIntro">{t("إرسال الطلب لا يعني موعدًا مؤكدًا؛ نتواصل معك أولًا لتأكيد التفاصيل والموعد.", "Submitting a request does not mean a confirmed appointment; we contact you first to confirm the details and timing.")}</p></div><div className="serviceJourneyGrid">{[["01",t("أرسل الطلب","Send request")],["02",t("مراجعة وتنسيق","Review and coordinate")],["03",t("توضيح التكلفة","Clarify cost")],["04",t("تنفيذ ومتابعة","Complete and follow up")]].map(([number,label])=><article key={number}><strong>{number}</strong><p>{label}</p></article>)}</div></div></section>

      <section className="serviceFinalCta"><div className="container pageCta"><div><p className="eyebrow">{t("لم تجد وصف مشكلتك؟", "Could not find your exact issue?")}</p><h2>{t("أرسل التفاصيل وسنساعدك في تحديد الخدمة المناسبة.", "Send the details and we will help identify the right service.")}</h2></div><Link className="button primary" href="/request">{t("طلب خدمة", "Request service")}</Link></div></section>
      <SiteFooter />
    </main>
  );
}
