import styles from "../Marketing.module.css";

export const dynamic = "force-dynamic";

type Integration = {
  name: string;
  category: string;
  envName: string;
  configured: boolean;
  activeInSite: boolean;
  note: string;
};

export default function MarketingIntegrationsPage() {
  const integrations: Integration[] = [
    {
      name: "Google Analytics 4",
      category: "التحليلات",
      envName: "NEXT_PUBLIC_GA_MEASUREMENT_ID",
      configured: Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
      activeInSite: Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
      note: "مربوط حاليًا من التخطيط الرئيسي للموقع ويرسل أحداث Funnel عبر gtag عند توفر المعرّف.",
    },
    {
      name: "Google Tag Manager",
      category: "إدارة الوسوم",
      envName: "NEXT_PUBLIC_GTM_ID",
      configured: Boolean(process.env.NEXT_PUBLIC_GTM_ID),
      activeInSite: false,
      note: "محجوز للتكامل لاحقًا. لا يتم حقن GTM حاليًا.",
    },
    {
      name: "Google Ads",
      category: "الإعلانات والتحويلات",
      envName: "NEXT_PUBLIC_GOOGLE_ADS_ID",
      configured: Boolean(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID),
      activeInSite: false,
      note: "سيتم ربط تحويل generate_lead لاحقًا بعد اعتماد معرف التحويل وسياسة الموافقة.",
    },
    {
      name: "Meta Pixel",
      category: "الإعلانات",
      envName: "NEXT_PUBLIC_META_PIXEL_ID",
      configured: Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID),
      activeInSite: false,
      note: "غير مفعّل حاليًا. لن يتم تشغيله قبل اعتماد الموافقة والخصوصية.",
    },
    {
      name: "TikTok Pixel",
      category: "الإعلانات",
      envName: "NEXT_PUBLIC_TIKTOK_PIXEL_ID",
      configured: Boolean(process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID),
      activeInSite: false,
      note: "غير مفعّل حاليًا.",
    },
    {
      name: "Snap Pixel",
      category: "الإعلانات",
      envName: "NEXT_PUBLIC_SNAP_PIXEL_ID",
      configured: Boolean(process.env.NEXT_PUBLIC_SNAP_PIXEL_ID),
      activeInSite: false,
      note: "غير مفعّل حاليًا.",
    },
    {
      name: "X Pixel",
      category: "الإعلانات",
      envName: "NEXT_PUBLIC_X_PIXEL_ID",
      configured: Boolean(process.env.NEXT_PUBLIC_X_PIXEL_ID),
      activeInSite: false,
      note: "غير مفعّل حاليًا.",
    },
  ];

  const configuredCount = integrations.filter((item) => item.configured).length;
  const activeCount = integrations.filter((item) => item.activeInSite).length;

  return (
    <main className="adminPage">
      <div className="container adminContainer">
        <div className="adminTopbar"><div><p className="eyebrow">التسويق</p><h1>التكاملات</h1></div></div>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}><span>التكاملات المعرفة</span><strong>{integrations.length}</strong></div>
          <div className={styles.summaryCard}><span>مهيأة في البيئة</span><strong>{configuredCount}</strong></div>
          <div className={styles.summaryCard}><span>مفعلة فعليًا في الموقع</span><strong>{activeCount}</strong></div>
          <div className={styles.summaryCard}><span>إدخال JavaScript خام</span><strong className={styles.statusText}>محظور</strong></div>
        </div>

        <section className={styles.panel}>
          <h2>حالة منصات القياس والإعلانات</h2>
          <p className={styles.muted}>تعرض الصفحة حالة التهيئة فقط. لا تعرض القيم السرية ولا تسمح بإضافة سكربتات خام من لوحة الإدارة.</p>
          <div className={styles.integrationGrid}>
            {integrations.map((item) => (
              <article className={styles.integrationCard} key={item.name}>
                <div className={styles.integrationHeader}>
                  <div><span>{item.category}</span><h3>{item.name}</h3></div>
                  <span className={item.activeInSite ? styles.readyBadge : item.configured ? styles.pendingBadge : styles.offBadge}>
                    {item.activeInSite ? "مفعّل" : item.configured ? "مهيأ فقط" : "غير مهيأ"}
                  </span>
                </div>
                <p>{item.note}</p>
                <div className={styles.integrationMeta}>
                  <span>متغير البيئة</span>
                  <code dir="ltr">{item.envName}</code>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <h2>سياسة الأمان</h2>
          <p className={styles.muted}>التكاملات التسويقية يجب أن تستخدم معرفات محددة ومعروفة فقط. لا يتم تخزين مفاتيح سرية في الواجهة، ولا يسمح بتخزين أو تنفيذ JavaScript عشوائي من قاعدة البيانات أو لوحة الإدارة.</p>
        </section>
      </div>
    </main>
  );
}
