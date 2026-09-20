import { createClient } from "@/lib/supabase/server";
import { getLocale, text } from "@/lib/locale";
import { MarketingSections } from "@/app/components/MarketingSections";
import Link from "next/link";
import SiteFooter from "@/app/components/SiteFooter";
import ContactForm from "@/app/components/ContactForm";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const services = [
  ["التكييف", "صيانة وتنظيف وإصلاح أجهزة التكييف للحفاظ على كفاءتها."],
  ["السباكة", "معالجة التسريبات والأعطال وتركيب وإصلاح التمديدات الصحية."],
  ["الكهرباء", "تمديدات، إصلاح أعطال، وتركيب وتجهيزات كهربائية."],
  ["النجارة", "إصلاح وتركيب الأبواب والأثاث وأعمال النجارة المختلفة."],
];

const benefits = [
  ["استجابة سريعة", "نتعامل مع طلبك بوضوح ونرتب التواصل معك بأسرع وقت ممكن."],
  ["فنيون متخصصون", "نحرص على توجيه كل طلب إلى الخدمة والفني المناسبين."],
  ["جودة في التنفيذ", "نهتم بالتنفيذ المنظم ومعالجة المشكلة من جذورها قدر الإمكان."],
  ["طلب سهل", "أرسل تفاصيل المشكلة والعنوان من نموذج واحد دون تعقيد."],
];

const works = [
  ["أعمال كهربائية", "إصلاح وتجهيزات كهربائية"],
  ["صيانة تكييف", "فحص وتنظيف وصيانة"],
  ["أعمال سباكة", "إصلاح التسريبات والأعطال"],
];

const serviceRouteByTitle: Record<string, string> = {
  "التكييف": "/services/ac",
  "Air conditioning": "/services/ac",
  "السباكة": "/services/plumbing",
  "Plumbing": "/services/plumbing",
  "الكهرباء": "/services/electrical",
  "Electrical": "/services/electrical",
  "النجارة": "/services/carpentry",
  "Carpentry": "/services/carpentry",
};

export default async function Home() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => text(locale, ar, en);
  const supabase = await createClient();
  const [{ data: sections }, { data: sectionItems }] = await Promise.all([
    supabase.from("site_sections").select("*").order("sort_order"),
    supabase.from("site_section_items").select("*").order("sort_order"),
  ]);
  const sectionBySlug = new Map((sections ?? []).filter(section => section.is_visible).map(section => [section.slug, section]));
  const sectionIsVisible = (slug: string) => sectionBySlug.has(slug);
  const sectionText = (slug: string, field: "eyebrow" | "title" | "description", arFallback: string, enFallback: string) => {
    const section = sectionBySlug.get(slug);
    const enField = `${field}_en` as "eyebrow_en" | "title_en" | "description_en";
    return locale === "en" ? section?.[enField] || enFallback : section?.[field] || arFallback;
  };

  const itemsFor = (slug: string) => {
    const section = sectionBySlug.get(slug);
    return section ? (sectionItems ?? []).filter(item => item.section_id === section.id && item.is_visible) : [];
  };
  const serviceItems = itemsFor("services");
  const benefitItems = itemsFor("why-us");
  const workItems = itemsFor("works");
  return (
    <main style={{ display: "flex", flexDirection: "column" }}>
      {sectionIsVisible("hero") ? <section id="top" className="hero" style={{ order: (sectionBySlug.get("hero")?.sort_order ?? 0) * 10 }}>
        <div className="container heroGrid">
          <div className="heroContent">
            <p className="eyebrow">{sectionText("hero","eyebrow","معين.. الصيانة أسهل","Mueen makes maintenance easier")}</p>
            <h1>{sectionText("hero","title","صيانة موثوقة. موعد واضح. سعر عادل.","Reliable maintenance. Clear appointment. Fair price.")}</h1>
            <p className="heroText">
              {sectionText("hero","description","خدمات التكييف والسباكة والكهرباء والنجارة، بطريقة منظمة من طلب الخدمة وحتى التنفيذ والمتابعة.","Air conditioning, plumbing, electrical and carpentry services, managed from request to completion and follow-up.")}
            </p>
            <div className="actions">
              <a className="button primary largeButton" href="/request">{t("ابدأ طلب الخدمة","Request service")}</a>
              <a className="button secondary largeButton" href="#services">{t("استعرض خدماتنا","Explore services")}</a>
            </div>
            <div className="heroTrust">
              <span>{t("✓ تكلفة واضحة قبل التنفيذ","✓ Clear cost before work")}</span>
              <span>{t("✓ موافقتك قبل الأعمال الإضافية","✓ Approval before extra work")}</span>
              <span>{t("✓ متابعة من معين","✓ Follow-up by Mueen")}</span>
            </div>
          </div>

          <div className="heroPanel" aria-label="خدمات الصيانة">
            {sectionBySlug.get("hero")?.image_url ? <img src={sectionBySlug.get("hero")!.image_url!} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
            <div className="heroPanelGlow" />
            <div className="heroPanelContent">
              <div className="panelIcon">⚒</div>
              <p className="panelLabel">{t("خدمة الصيانة تبدأ من هنا","Maintenance starts here")}</p>
              <h2>{t("صف مشكلتك، واترك علينا الباقي.","Describe the issue. We will take it from there.")}</h2>
              <p>{t("نستقبل تفاصيل طلبك ونرتب الخطوة التالية معك.","Share your request and we will arrange the next step.")}</p>
              <a href="/request" className="panelLink">{t("إرسال طلب الخدمة ←","Send a request →")}</a>
            </div>
          </div>
        </div>
      </section> : null}

      {sectionIsVisible("services") ? <section id="services" className="section servicesSection" style={{ order: (sectionBySlug.get("services")?.sort_order ?? 1) * 10 }}>
        <div className="container">
          <div className="sectionHeading">
            <div>
              <p className="eyebrow">{sectionText("services","eyebrow","خدماتنا","Our services")}</p>
              <h2>{sectionText("services","title","كل ما تحتاجه للصيانة في مكان واحد","Maintenance services in one place")}</h2>
            </div>
            <p className="sectionIntro">{sectionText("services","description","خدمات أساسية للمنازل والمنشآت، مع إمكانية إضافة خدمات أخرى حسب احتياجك.","Essential maintenance for homes and facilities, tailored to your needs.")}</p>
          </div>
          <div className="grid serviceGrid">
            {(sectionBySlug.has("services") ? serviceItems.map(item => [locale === "en" ? item.title_en || item.title : item.title, locale === "en" ? item.description_en || item.description : item.description] as [string, string]) : services).map(([title, description], index) => (
              <article className="card serviceCard" key={title}>
                {serviceItems[index]?.image_url ? <img src={serviceItems[index].image_url!} alt="" style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 8, marginBottom: 10 }} /> : null}
                <div className="serviceNumber">0{index + 1}</div>
                <h3>{title}</h3>
                <p>{description}</p>
                <div className="serviceCardActions"><Link href={serviceRouteByTitle[title] ?? "/services"} className="cardLink">{t("تفاصيل الخدمة","Service details")}</Link><Link href="/request" className="cardLink">{t("اطلب الخدمة ←","Request service →")}</Link></div>
              </article>
            ))}
          </div>
          <div className="sectionAction"><a className="button secondary" href="/services">{t("عرض جميع الخدمات","View all services")}</a></div>
        </div>
      </section> : null}

      {sectionIsVisible("why-us") ? <section id="why-us" className="section whySection" style={{ order: (sectionBySlug.get("why-us")?.sort_order ?? 2) * 10 }}>
        <div className="container">
          <div className="sectionHeading centered">
            <p className="eyebrow">{sectionText("why-us","eyebrow","لماذا نحن؟","Why us?")}</p>
            <h2>{sectionText("why-us","title","تجربة صيانة أبسط وأكثر وضوحًا","A clearer, simpler maintenance experience")}</h2>
            <p className="sectionIntro">{sectionText("why-us","description","من أول طلب الخدمة حتى التواصل، صممنا التجربة لتكون مباشرة وسهلة.","From your first request to follow-up, every step is straightforward.")}</p>
          </div>
          <div className="benefitGrid">
            {(sectionBySlug.has("why-us") ? benefitItems.map(item => [locale === "en" ? item.title_en || item.title : item.title, locale === "en" ? item.description_en || item.description : item.description] as [string, string]) : benefits).map(([title, description], index) => (
              <article className="benefit" key={title}>
                <div className="benefitIcon">{benefitItems[index]?.image_url ? <img src={benefitItems[index].image_url!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }} /> : index + 1}</div>
                <div><h3>{title}</h3><p>{description}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section> : null}

      {false && sectionIsVisible("works") ? <section id="works" className="section worksSection" style={{ order: (sectionBySlug.get("works")?.sort_order ?? 3) * 10 }}>
        <div className="container">
          <div className="sectionHeading">
            <div><p className="eyebrow">{sectionText("works","eyebrow","أعمالنا","Our work")}</p><h2>{sectionText("works","title","نماذج من الأعمال المنفذة","Examples of our work")}</h2></div>
            <p className="sectionIntro">{sectionText("works","description","سيتم استبدال المساحات التالية بصور حقيقية من مشاريعكم عند توفرها.","Selected maintenance work and project photos.")}</p>
          </div>
          <div className="worksGrid">
            {(sectionBySlug.has("works") ? workItems.map(item => [locale === "en" ? item.title_en || item.title : item.title, locale === "en" ? item.description_en || item.description : item.description] as [string, string]) : works).map(([title, description], index) => (
              <article className="workCard" key={title}>
                <div className="workImagePlaceholder">{workItems[index]?.image_url ? <img src={workItems[index].image_url!} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{t("صورة العمل","Work photo")} {index + 1}</span>}</div>
                <div className="workCardBody"><h3>{title}</h3><p>{description}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section> : null}

      <MarketingSections />
      <section className="ctaSection" style={{ order: 98 }}>
        <div className="container ctaBox">
          <div>
            <p className="eyebrow">{t("هل لديك مشكلة تحتاج إلى صيانة؟","Need maintenance?")}</p>
            <h2>{t("أرسل طلبك الآن ودعنا نساعدك.","Send your request and let us help.")}</h2>
            <p>{t("أدخل بياناتك ووصف المشكلة والعنوان، وسنتواصل معك لتأكيد الخدمة.","Enter your details, describe the issue, and we will contact you.")}</p>
          </div>
          <a className="button lightButton" href="/request">{t("طلب خدمة الآن","Request service now")}</a>
        </div>
      </section>

      {sectionIsVisible("contact") ? <section id="contact" className="section contactSection" style={{ order: (sectionBySlug.get("contact")?.sort_order ?? 4) * 10 }}>
        <div className="container contactGrid">
          <div>
            <p className="eyebrow">{sectionText("contact","eyebrow","تواصل معنا","Contact us")}</p>
            <h2>{sectionText("contact","title","نحن هنا لخدمتك","We are here to help")}</h2>
            <p className="sectionIntro">{sectionText("contact","description","يمكنك إرسال طلب الصيانة مباشرة من الموقع، وستتم متابعة الطلب والتواصل معك.","Send a maintenance request and our team will follow up with you.")}</p>
          </div>
          <div className="contactCard"><span>{t("لديك استفسار؟","Have a question?")}</span><strong>{t("راسل فريق معين","Message the Mueen team")}</strong><ContactForm /></div>
        </div>
      </section> : null}

      <SiteFooter order={99} />
    </main>
  );
}
