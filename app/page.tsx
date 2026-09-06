const services = [
  ["الكهرباء", "أعمال وتمديدات وإصلاحات كهربائية."],
  ["التكييف", "صيانة وإصلاح وتنظيف أجهزة التكييف."],
  ["السباكة", "إصلاح التسريبات والأعطال وأعمال السباكة."],
  ["النجارة", "أعمال وإصلاحات النجارة للمنازل والمنشآت."],
  ["خدمات أخرى", "اطلب الخدمة المناسبة وسنساعدك في تحديد الحل."],
];

export default function Home() {
  return (
    <main>
      <header className="header">
        <div className="container nav">
          <a className="logo" href="#top">خدمات الصيانة</a>
          <nav className="navLinks" aria-label="التنقل الرئيسي">
            <a href="#services">الخدمات</a>
            <a href="#works">الأعمال</a>
            <a href="#contact">تواصل معنا</a>
          </nav>
        </div>
      </header>

      <section id="top" className="hero">
        <div className="container">
          <h1>خدمات صيانة عامة تصل إليك عندما تحتاجها.</h1>
          <p>
            نوفر خدمات الصيانة العامة للأعمال الكهربائية والتكييف والسباكة والنجارة وغيرها،
            مع استقبال طلبك ومتابعته بطريقة منظمة.
          </p>
          <div className="actions">
            <a className="button primary" href="#request">طلب خدمة</a>
            <a className="button secondary" href="#contact">تواصل معنا</a>
          </div>
        </div>
      </section>

      <section id="services" className="section">
        <div className="container">
          <h2>خدماتنا</h2>
          <p className="sectionIntro">مجموعة من خدمات الصيانة الأساسية، مع إمكانية إضافة خدمات أخرى لاحقًا.</p>
          <div className="grid">
            {services.map(([title, description]) => (
              <article className="card" key={title}>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="works" className="section">
        <div className="container">
          <h2>الأعمال المنفذة</h2>
          <p className="sectionIntro">سيتم هنا عرض صور مختارة من الأعمال المنفذة مع وصف مختصر لكل عمل.</p>
          <div className="card">
            <p>معرض الأعمال قيد التجهيز.</p>
          </div>
        </div>
      </section>

      <section id="request" className="section">
        <div className="container">
          <h2>طلب خدمة</h2>
          <p className="sectionIntro">سنحوّل هذا القسم في الخطوة التالية إلى نموذج مرتبط مباشرة بـ Supabase.</p>
          <a className="button primary" href="#contact">ابدأ الطلب</a>
        </div>
      </section>

      <section id="contact" className="section">
        <div className="container">
          <h2>تواصل معنا</h2>
          <p className="sectionIntro">سيتم إضافة رقم الهاتف وواتساب ونموذج التواصل عند استكمال بيانات التشغيل.</p>
        </div>
      </section>

      <footer className="footer">
        <div className="container">خدمات الصيانة العامة</div>
      </footer>
    </main>
  );
}
