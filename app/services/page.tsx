const services = [
  { slug: "electricity", title: "الكهرباء", description: "تمديدات وإصلاح الأعطال والتركيب والتجهيزات الكهربائية للمنازل والمنشآت." },
  { slug: "ac", title: "التكييف", description: "صيانة وتنظيف وإصلاح أجهزة التكييف ومتابعة المشكلات التي تؤثر في كفاءتها." },
  { slug: "plumbing", title: "السباكة", description: "معالجة التسريبات والأعطال وإصلاح وتركيب التمديدات الصحية." },
  { slug: "carpentry", title: "النجارة", description: "إصلاح وتركيب الأبواب والأثاث وتنفيذ أعمال النجارة المختلفة." },
  { slug: "other", title: "خدمات أخرى", description: "إذا لم تجد الخدمة التي تبحث عنها، أرسل تفاصيل احتياجك وسنساعدك في تحديد الحل." },
];

export const metadata = {
  title: "الخدمات | خدمات الصيانة العامة",
  description: "تعرف على خدمات الصيانة العامة المتاحة واطلب الخدمة المناسبة.",
};

export default function ServicesPage() {
  return (
    <main className="innerPage">
      <div className="container">
        <a className="backLink" href="/">← العودة للرئيسية</a>
        <header className="innerHeader">
          <p className="eyebrow">خدماتنا</p>
          <h1>خدمات صيانة متنوعة باحتياجك</h1>
          <p>اختر الخدمة الأقرب لاحتياجك، ثم أرسل تفاصيل المشكلة من نموذج طلب الخدمة.</p>
        </header>
        <div className="servicePageGrid">
          {services.map((service, index) => (
            <article className="serviceDetailCard" key={service.slug}>
              <span className="serviceNumber">0{index + 1}</span>
              <h2>{service.title}</h2>
              <p>{service.description}</p>
              <a className="cardLink" href="/request">اطلب هذه الخدمة ←</a>
            </article>
          ))}
        </div>
        <div className="pageCta">
          <div>
            <p className="eyebrow">لم تجد ما تبحث عنه؟</p>
            <h2>أرسل تفاصيل المشكلة وسنساعدك.</h2>
          </div>
          <a className="button primary" href="/request">طلب خدمة</a>
        </div>
      </div>
    </main>
  );
}
