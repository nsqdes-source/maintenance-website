import HeaderAccountControl from "./components/HeaderAccountControl";
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

  const footer = {
    companyName: footerContent?.company_name ?? "خدمات الصيانة العامة",
    description: footerContent?.description ?? "خدمات صيانة عامة موثوقة وسريعة.",
    phone: footerContent?.phone ?? "",
    email: footerContent?.email ?? "",
    address: footerContent?.address ?? "",
    copyright: footerContent?.copyright_text ?? "© 2026 جميع الحقوق محفوظة",
  };

  return (
    <main>
      <section id="top" className="hero">
        <div className="container heroGrid">
          <div className="heroContent">
            <p className="eyebrow">صيانة منزلية ومنشآت</p>
            <h1>حلول صيانة موثوقة، <span>عندما تحتاجها.</span></h1>
            <p className="heroText">
              نقدم خدمات الصيانة العامة في الكهرباء والتكييف والسباكة والنجارة وغيرها،
              مع طريقة سهلة لإرسال طلبك ومتابعته.
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
      </section>

      <section id="services" className="section servicesSection">
        <div className="container">
          <div className="sectionHeading">
            <div>
              <p className="eyebrow">خدماتنا</p>
              <h2>كل ما تحتاجه للصيانة في مكان واحد</h2>
            </div>
            <p className="sectionIntro">خدمات أساسية للمنازل والمنشآت، مع إمكانية إضافة خدمات أخرى حسب احتياجك.</p>
          </div>
          <div className="grid serviceGrid">
            {services.map(([title, description], index) => (
              <article className="card serviceCard" key={title}>
                <div className="serviceNumber">0{index + 1}</div>
                <h3>{title}</h3>
                <p>{description}</p>
                <a href="/request" className="cardLink">اطلب الخدمة ←</a>
              </article>
            ))}
          </div>
          <div className="sectionAction"><a className="button secondary" href="/services">عرض جميع الخدمات</a></div>
        </div>
      </section>

      <section id="why-us" className="section whySection">
        <div className="container">
          <div className="sectionHeading centered">
            <p className="eyebrow">لماذا نحن؟</p>
            <h2>تجربة صيانة أبسط وأكثر وضوحًا</h2>
            <p className="sectionIntro">من أول طلب الخدمة حتى التواصل، صممنا التجربة لتكون مباشرة وسهلة.</p>
          </div>
          <div className="benefitGrid">
            {benefits.map(([title, description], index) => (
              <article className="benefit" key={title}>
                <div className="benefitIcon">{index + 1}</div>
                <div><h3>{title}</h3><p>{description}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="works" className="section worksSection">
        <div className="container">
          <div className="sectionHeading">
            <div><p className="eyebrow">أعمالنا</p><h2>نماذج من الأعمال المنفذة</h2></div>
            <p className="sectionIntro">سيتم استبدال المساحات التالية بصور حقيقية من مشاريعكم عند توفرها.</p>
          </div>
          <div className="worksGrid">
            {works.map(([title, description], index) => (
              <article className="workCard" key={title}>
                <div className="workImagePlaceholder"><span>صورة العمل {index + 1}</span></div>
                <div className="workCardBody"><h3>{title}</h3><p>{description}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ctaSection">
        <div className="container ctaBox">
          <div>
            <p className="eyebrow">هل لديك مشكلة تحتاج إلى صيانة؟</p>
            <h2>أرسل طلبك الآن ودعنا نساعدك.</h2>
            <p>أدخل بياناتك ووصف المشكلة والعنوان، وسنتواصل معك لتأكيد الخدمة.</p>
          </div>
          <a className="button lightButton" href="/request">طلب خدمة الآن</a>
        </div>
      </section>

      <section id="contact" className="section contactSection">
        <div className="container contactGrid">
          <div>
            <p className="eyebrow">تواصل معنا</p>
            <h2>نحن هنا لخدمتك</h2>
            <p className="sectionIntro">يمكنك إرسال طلب الصيانة مباشرة من الموقع، وستتم متابعة الطلب والتواصل معك.</p>
          </div>
          <div className="contactCard">
            <span>لديك طلب صيانة؟</span>
            <strong>ابدأ من نموذج الطلب</strong>
            <a className="button primary" href="/request">فتح نموذج الطلب</a>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container footerInner">
          <div>
            <div className="logo"><span className="logoMark">ص</span><span>{footer.companyName}</span></div>
            <p className="footerDescription">{footer.description}</p>
            {footer.address ? <span className="footerContact">{footer.address}</span> : null}
            {footer.phone ? <a className="footerContact" href={`tel:${footer.phone}`}>{footer.phone}</a> : null}
            {footer.email ? <a className="footerContact" href={`mailto:${footer.email}`}>{footer.email}</a> : null}
          </div>
          <span>{footer.copyright}</span>
        </div>
      </footer>
    </main>
  );
}
