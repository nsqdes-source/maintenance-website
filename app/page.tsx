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

export default function Home() {
  return (
    <main>
      <header className="header">
        <div className="container nav">
          <a className="logo" href="#top" aria-label="خدمات الصيانة العامة">
            <span className="logoMark">ص</span>
            <span>خدمات الصيانة</span>
          </a>
          <nav className="navLinks" aria-label="التنقل الرئيسي">
            <a href="#services">الخدمات</a>
            <a href="#why-us">لماذا نحن</a>
            <a href="#works">الأعمال</a>
            <a href="#contact">تواصل معنا</a>
          </nav>
          <a className="button primary navCta" href="/request">اطلب خدمة</a>
        </div>
      </header>

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
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="works" className="section worksSection">
        <div className="container">
          <div className="sectionHeading">
            <div>
              <p className="eyebrow">أعمالنا</p>
              <h2>نستعد لعرض أعمالنا المنفذة</h2>
            </div>
            <p className="sectionIntro">سيتم إضافة صور مختارة من الأعمال المنفذة مع وصف مختصر لكل مشروع.</p>
          </div>
          <div className="workPlaceholder">
            <div className="workPlaceholderIcon">＋</div>
            <div>
              <h3>معرض الأعمال قيد التجهيز</h3>
              <p>يمكن إضافة صور المشاريع لاحقًا دون تغيير بنية الموقع.</p>
            </div>
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
            <p className="sectionIntro">سيتم إضافة بيانات الهاتف وواتساب وقنوات التواصل عند استكمال بيانات التشغيل.</p>
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
          <div className="logo"><span className="logoMark">ص</span><span>خدمات الصيانة العامة</span></div>
          <span>© 2026 جميع الحقوق محفوظة</span>
        </div>
      </footer>
    </main>
  );
}
