import { createClient } from "@/lib/supabase/server";

const services = [
  ["الكهرباء", "تمديدات، إصلاح أعطال، وتركيب وتجهيزات كهربائية."],
  ["التكييف", "صيانة وتنظيف وإصلاح أجهزة التكييف للحفاظ على كفاءتها."],
  ["السباكة", "معالجة التسريبات والأعطال وتركيب وإصلاح التمديدات الصحية."],
  ["النجارة", "إصلاح وتركيب الأبواب والأثاث وأعمال النجارة المختلفة."],
  ["خدمات أخرى", "أرسل تفاصيل احتياجك وسنساعدك في تحديد الخدمة المناسبة."],
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

export default async function Home() {
  const supabase = await createClient();
  const { data: footerContent } = await supabase
    .from("site_footer_content")
    .select("company_name, description, phone, email, address, copyright_text")
    .eq("id", true)
    .maybeSingle();

  const [{ data: sections }, { data: sectionItems }] = await Promise.all([
    supabase.from("site_sections").select("id,slug,eyebrow,title,description,image_url,sort_order,is_visible").order("sort_order"),
    supabase.from("site_section_items").select("id,section_id,title,description,image_url,sort_order,is_visible").order("sort_order"),
  ]);
  const sectionBySlug = new Map((sections ?? []).filter(section => section.is_visible).map(section => [section.slug, section]));
  const sectionIsVisible = (slug: string) => sectionBySlug.has(slug);
  const itemsFor = (slug: string) => {
    const section = sectionBySlug.get(slug);
    return section ? (sectionItems ?? []).filter(item => item.section_id === section.id && item.is_visible) : [];
  };
  const serviceItems = itemsFor("services");
  const benefitItems = itemsFor("why-us");
  const workItems = itemsFor("works");
  const footer = {
    companyName: footerContent?.company_name ?? "خدمات الصيانة العامة",
    description: footerContent?.description ?? "خدمات صيانة عامة موثوقة وسريعة.",
    phone: footerContent?.phone ?? "",
    email: footerContent?.email ?? "",
    address: footerContent?.address ?? "",
    copyright: footerContent?.copyright_text ?? "© 2026 جميع الحقوق محفوظة",
  };

  return (
    <main style={{ display: "flex", flexDirection: "column" }}>
      {sectionIsVisible("hero") ? <section id="top" className="hero" style={{ order: sectionBySlug.get("hero")?.sort_order ?? 0 }}>
        <div className="container heroGrid">
          <div className="heroContent">
            <p className="eyebrow">{sectionBySlug.get("hero")?.eyebrow || "صيانة منزلية ومنشآت"}</p>
            <h1>{sectionBySlug.get("hero")?.title || "حلول صيانة موثوقة، عندما تحتاجها."}</h1>
            <p className="heroText">
              {sectionBySlug.get("hero")?.description || "نقدم خدمات الصيانة العامة في الكهرباء والتكييف والسباكة والنجارة وغيرها، مع طريقة سهلة لإرسال طلبك ومتابعته."}
            </p>
            <div className="actions">
              <a className="button primary largeButton" href="/request">ابدأ طلب الخدمة</a>
              <a className="button secondary largeButton" href="#services">استعرض خدماتنا</a>
            </div>
            <div className="heroTrust">
              <span>✓ طلب منظم</span>
              <span>✓ خدمات متعددة</span>
              <span>✓ تواصل مباشر</span>
            </div>
          </div>

          <div className="heroPanel" aria-label="خدمات الصيانة">
            {sectionBySlug.get("hero")?.image_url ? <img src={sectionBySlug.get("hero")!.image_url!} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
            <div className="heroPanelGlow" />
            <div className="heroPanelContent">
              <div className="panelIcon">⚒</div>
              <p className="panelLabel">خدمة الصيانة تبدأ من هنا</p>
              <h2>صف مشكلتك، واترك علينا الباقي.</h2>
              <p>نستقبل تفاصيل طلبك ونرتب الخطوة التالية معك.</p>
              <a href="/request" className="panelLink">إرسال طلب الخدمة ←</a>
            </div>
          </div>
        </div>
      </section> : null}

      {sectionIsVisible("services") ? <section id="services" className="section servicesSection" style={{ order: sectionBySlug.get("services")?.sort_order ?? 1 }}>
        <div className="container">
          <div className="sectionHeading">
            <div>
              <p className="eyebrow">{sectionBySlug.get("services")?.eyebrow || "خدماتنا"}</p>
              <h2>{sectionBySlug.get("services")?.title || "كل ما تحتاجه للصيانة في مكان واحد"}</h2>
            </div>
            <p className="sectionIntro">{sectionBySlug.get("services")?.description || "خدمات أساسية للمنازل والمنشآت، مع إمكانية إضافة خدمات أخرى حسب احتياجك."}</p>
          </div>
          <div className="grid serviceGrid">
            {(sectionBySlug.has("services") ? serviceItems.map(item => [item.title, item.description] as [string, string]) : services).map(([title, description], index) => (
              <article className="card serviceCard" key={title}>
                {serviceItems[index]?.image_url ? <img src={serviceItems[index].image_url!} alt="" style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 8, marginBottom: 10 }} /> : null}
                <div className="serviceNumber">0{index + 1}</div>
                <h3>{title}</h3>
                <p>{description}</p>
                <a href="/request" className="cardLink">اطلب الخدمة ←</a>
              </article>
            ))}
          </div>
          <div className="sectionAction"><a className="button secondary" href="/services">عرض جميع الخدمات</a></div>
        </div>
      </section> : null}

      {sectionIsVisible("why-us") ? <section id="why-us" className="section whySection" style={{ order: sectionBySlug.get("why-us")?.sort_order ?? 2 }}>
        <div className="container">
          <div className="sectionHeading centered">
            <p className="eyebrow">{sectionBySlug.get("why-us")?.eyebrow || "لماذا نحن؟"}</p>
            <h2>{sectionBySlug.get("why-us")?.title || "تجربة صيانة أبسط وأكثر وضوحًا"}</h2>
            <p className="sectionIntro">{sectionBySlug.get("why-us")?.description || "من أول طلب الخدمة حتى التواصل، صممنا التجربة لتكون مباشرة وسهلة."}</p>
          </div>
          <div className="benefitGrid">
            {(sectionBySlug.has("why-us") ? benefitItems.map(item => [item.title, item.description] as [string, string]) : benefits).map(([title, description], index) => (
              <article className="benefit" key={title}>
                <div className="benefitIcon">{benefitItems[index]?.image_url ? <img src={benefitItems[index].image_url!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }} /> : index + 1}</div>
                <div><h3>{title}</h3><p>{description}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section> : null}

      {sectionIsVisible("works") ? <section id="works" className="section worksSection" style={{ order: sectionBySlug.get("works")?.sort_order ?? 3 }}>
        <div className="container">
          <div className="sectionHeading">
            <div><p className="eyebrow">{sectionBySlug.get("works")?.eyebrow || "أعمالنا"}</p><h2>{sectionBySlug.get("works")?.title || "نماذج من الأعمال المنفذة"}</h2></div>
            <p className="sectionIntro">{sectionBySlug.get("works")?.description || "سيتم استبدال المساحات التالية بصور حقيقية من مشاريعكم عند توفرها."}</p>
          </div>
          <div className="worksGrid">
            {(sectionBySlug.has("works") ? workItems.map(item => [item.title, item.description] as [string, string]) : works).map(([title, description], index) => (
              <article className="workCard" key={title}>
                <div className="workImagePlaceholder">{workItems[index]?.image_url ? <img src={workItems[index].image_url!} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>صورة العمل {index + 1}</span>}</div>
                <div className="workCardBody"><h3>{title}</h3><p>{description}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section> : null}

      <section className="ctaSection" style={{ order: 98 }}>
        <div className="container ctaBox">
          <div>
            <p className="eyebrow">هل لديك مشكلة تحتاج إلى صيانة؟</p>
            <h2>أرسل طلبك الآن ودعنا نساعدك.</h2>
            <p>أدخل بياناتك ووصف المشكلة والعنوان، وسنتواصل معك لتأكيد الخدمة.</p>
          </div>
          <a className="button lightButton" href="/request">طلب خدمة الآن</a>
        </div>
      </section>

      {sectionIsVisible("contact") ? <section id="contact" className="section contactSection" style={{ order: sectionBySlug.get("contact")?.sort_order ?? 4 }}>
        <div className="container contactGrid">
          <div>
            <p className="eyebrow">{sectionBySlug.get("contact")?.eyebrow || "تواصل معنا"}</p>
            <h2>{sectionBySlug.get("contact")?.title || "نحن هنا لخدمتك"}</h2>
            <p className="sectionIntro">{sectionBySlug.get("contact")?.description || "يمكنك إرسال طلب الصيانة مباشرة من الموقع، وستتم متابعة الطلب والتواصل معك."}</p>
          </div>
          <div className="contactCard">
            <span>لديك طلب صيانة؟</span>
            <strong>ابدأ من نموذج الطلب</strong>
            <a className="button primary" href="/request">فتح نموذج الطلب</a>
          </div>
        </div>
      </section> : null}

      <footer className="footer" style={{ order: 99 }}>
        <div className="container footerInner">
          <div>
            <div className="logo"><span className="logoMark">ص</span><span>{footer.companyName}</span></div>
            <p className="footerDescription">{footer.description}</p>
            {footer.address ? <span className="footerContact">{footer.address}</span> : null}
            {footer.phone ? <a className="footerContact" href={`tel:${footer.phone}`}>{footer.phone}</a> : null}
            {footer.email ? <a className="footerContact" href={`mailto:${footer.email}`}>{footer.email}</a> : null}
          </div>
          <div>
            <a className="footerContact" href="/privacy">سياسة الخصوصية</a>
            <span style={{ display: "block", marginTop: 8 }}>{footer.copyright}</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
