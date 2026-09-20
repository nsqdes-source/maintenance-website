import Link from "next/link";
import { getLocale, text } from "@/lib/locale";
import { serviceCatalog, type LocalizedText, type ServicePageContent } from "./service-content";
import SiteFooter from "@/app/components/SiteFooter";
import ServiceAnalytics from "./ServiceAnalytics";

const journey = [
  { ar: "أرسل طلبك وحدد المشكلة", en: "Send your request and identify the issue" },
  { ar: "نراجع التفاصيل وننسق الموعد", en: "We review the details and coordinate the visit" },
  { ar: "نوضح المطلوب والتكلفة", en: "We explain the scope and cost" },
  { ar: "ننفذ بعد موافقتك ونتابع", en: "We proceed after approval and follow up" },
];

const pricing = [
  { title: { ar: "خدمة محددة", en: "Defined service" }, description: { ar: "سعر معروف مسبقًا عندما يسمح نطاق الخدمة.", en: "A known price in advance when the service scope allows." } },
  { title: { ar: "عطل يحتاج تشخيصًا", en: "Issue requiring diagnosis" }, description: { ar: "نشخّص المشكلة ثم نوضح التكلفة قبل الإصلاح.", en: "We diagnose the issue, then explain the cost before repair." } },
  { title: { ar: "عمل إضافي", en: "Additional work" }, description: { ar: "لا ينفذ قبل شرحه والحصول على موافقتك.", en: "It is not performed before explanation and approval." } },
];

export default async function ServiceLandingPage({ service }: { service: ServicePageContent }) {
  const locale = await getLocale();
  const t = (value: LocalizedText) => text(locale, value.ar, value.en);
  const otherServices = serviceCatalog.filter((item) => item.slug !== service.slug);

  return (
    <main className="serviceLanding">
      <ServiceAnalytics service={service.slug} />
      <section className="serviceLandingHero">
        <div className="container">
          <nav className="serviceBreadcrumbs" aria-label={text(locale, "مسار الصفحة", "Breadcrumb")}>
            <Link href="/">{text(locale, "الرئيسية", "Home")}</Link><span>/</span>
            <Link href="/services">{text(locale, "الخدمات", "Services")}</Link><span>/</span>
            <span>{t(service.name)}</span>
          </nav>
          <div className="serviceHeroGrid">
            <div>
              <p className="eyebrow">{t(service.eyebrow)}</p>
              <h1>{t(service.title)}</h1>
              <p className="serviceLead">{t(service.description)}</p>
              <div className="actions">
                <Link className="button primary largeButton" href="/request">{text(locale, "اطلب الخدمة الآن", "Request service now")}</Link>
                <Link className="button secondary largeButton" href="#issues">{text(locale, "اختر نوع المشكلة", "Choose an issue")}</Link>
              </div>
              <div className="serviceTrust"><span>✓ {text(locale, "تكلفة واضحة قبل التنفيذ", "Clear cost before work")}</span><span>✓ {text(locale, "موافقتك قبل العمل الإضافي", "Approval before extra work")}</span></div>
            </div>
            <aside className="serviceScopeCard">
              <span className="serviceLandingIcon" aria-hidden>{service.icon}</span>
              <strong>{text(locale, "نطاق الخدمة", "Service scope")}</strong>
              <p>{t(service.scope)}</p>
              <Link href="/request">{text(locale, "أرسل تفاصيل طلبك ←", "Send request details →")}</Link>
            </aside>
          </div>
        </div>
      </section>

      <section id="issues" className="section serviceIssuesSection">
        <div className="container">
          <div className="sectionHeading"><div><p className="eyebrow">{text(locale, "كيف يمكننا مساعدتك؟", "How can we help?")}</p><h2>{text(locale, "اختر المشكلة الأقرب لاحتياجك", "Choose the issue closest to your need")}</h2></div><p className="sectionIntro">{text(locale, "يمكنك شرح التفاصيل وإرفاق الصور في نموذج الطلب.", "You can describe the details and attach photos in the request form.")}</p></div>
          <div className="serviceIssueGrid">{service.issues.map((issue, index) => <article key={issue.ar}><span>{String(index + 1).padStart(2, "0")}</span><h3>{t(issue)}</h3><Link href="/request">{text(locale, "اطلب هذه الخدمة", "Request this service")}</Link></article>)}</div>
        </div>
      </section>

      <section className="section serviceDetailsSection">
        <div className="container serviceDetailList">
          {service.sections.map((section, index) => <article id={section.id} className="serviceFeature" key={section.id}><div className="serviceFeatureNumber">{String(index + 1).padStart(2, "0")}</div><div><h2>{t(section.title)}</h2><p>{t(section.description)}</p>{section.points?.length ? <ul>{section.points.map(point => <li key={point.ar}>✓ {t(point)}</li>)}</ul> : null}</div><Link className="button secondary" href="/request">{text(locale, "اطلب الخدمة", "Request service")}</Link></article>)}
        </div>
      </section>

      {service.slug === "ac" ? <section className="section serviceMultiSection"><div className="container ctaBox"><div><p className="eyebrow">{text(locale, "خدمة أذكى للمنزل", "A smarter home service")}</p><h2>{text(locale, "أكثر من مكيف؟ اجمعها في زيارة واحدة", "More than one AC? Combine them in one visit")}</h2><p>{text(locale, "اذكر عدد المكيفات واحتياج كل جهاز في الطلب، وسننسقها معك في زيارة واحدة قدر الإمكان.", "Tell us how many units you have and what each needs, and we will coordinate one visit where possible.")}</p></div><Link className="button lightButton" href="/request">{text(locale, "اطلب خدمة التكييف", "Request AC service")}</Link></div></section> : null}

      <section className="section serviceJourneySection"><div className="container"><div className="sectionHeading centered"><p className="eyebrow">{text(locale, "كيف تعمل معين", "How Mueen works")}</p><h2>{text(locale, "من الطلب إلى التنفيذ بخطوات واضحة", "Clear steps from request to completion")}</h2></div><div className="serviceJourneyGrid">{journey.map((step, index) => <article key={step.ar}><strong>{String(index + 1).padStart(2, "0")}</strong><p>{t(step)}</p></article>)}</div></div></section>

      <section className="section servicePricingSection"><div className="container"><div className="sectionHeading"><div><p className="eyebrow">{text(locale, "آلية التسعير", "Pricing mechanism")}</p><h2>{text(locale, "تعرف ما ستدفعه قبل أن يبدأ العمل", "Know what you will pay before work begins")}</h2></div></div><div className="servicePricingGrid">{pricing.map(item => <article key={item.title.ar}><h3>{t(item.title)}</h3><p>{t(item.description)}</p></article>)}</div></div></section>

      <section className="section serviceWarrantySection"><div className="container serviceWarrantyCard"><div><p className="eyebrow">{text(locale, "الضمان والثقة", "Warranty and trust")}</p><h2>{text(locale, "معين تتابع الخدمة بعد التنفيذ", "Mueen follows up after the service")}</h2><p>{text(locale, "ضمان على الأعمال المشمولة وفق نوع الخدمة وشروط الضمان الموضحة في الطلب أو الفاتورة.", "Covered work is warranted according to the service type and the terms shown in the request or invoice.")}</p></div><div className="serviceChecks"><span>✓ {text(locale, "الطلب موثق", "Documented request")}</span><span>✓ {text(locale, "تفاصيل العمل واضحة", "Clear work details")}</span><span>✓ {text(locale, "موافقتك أولًا", "Your approval first")}</span><span>✓ {text(locale, "متابعة من معين", "Follow-up by Mueen")}</span></div></div></section>

      <section className="section serviceFaqSection"><div className="container"><p className="eyebrow">{text(locale, "الأسئلة الشائعة", "Frequently asked questions")}</p><h2>{text(locale, `أسئلة عن خدمة ${service.name.ar}`, `${service.name.en} service questions`)}</h2><div className="faqList">{service.faqs.map(item => <details key={item.question.ar}><summary>{t(item.question)}</summary><p>{t(item.answer)}</p></details>)}</div></div></section>

      <section className="section relatedServicesSection"><div className="container"><div className="sectionHeading"><div><p className="eyebrow">{text(locale, "خدمات أخرى من معين", "Other Mueen services")}</p><h2>{text(locale, "كل خدمات الصيانة في مكان واحد", "Maintenance services in one place")}</h2></div><Link href="/services">{text(locale, "عرض مركز الخدمات ←", "View service hub →")}</Link></div><div className="relatedServiceGrid">{otherServices.map(item => <Link href={`/services/${item.slug}`} key={item.slug}><span aria-hidden>{item.icon}</span><strong>{t(item.name)}</strong><small>{t(item.description)}</small></Link>)}</div></div></section>

      <section className="serviceFinalCta"><div className="container pageCta"><div><p className="eyebrow">{text(locale, "جاهز لطلب الخدمة؟", "Ready to request service?")}</p><h2>{text(locale, "أرسل طلبك وسنراجع التفاصيل معك.", "Send your request and we will review the details with you.")}</h2></div><Link className="button primary" href="/request">{text(locale, "اطلب خدمة", "Request service")}</Link></div></section>
      <SiteFooter />
    </main>
  );
}
