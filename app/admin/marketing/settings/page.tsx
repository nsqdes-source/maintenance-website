import Link from "next/link";
import styles from "../Marketing.module.css";

export const dynamic = "force-dynamic";

export default function MarketingSettingsPage() {
  const gaConfigured = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  const gtmConfigured = Boolean(process.env.NEXT_PUBLIC_GTM_ID);
  const adsConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID);
  const adPixelsConfigured = Boolean(
    process.env.NEXT_PUBLIC_META_PIXEL_ID ||
    process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID ||
    process.env.NEXT_PUBLIC_SNAP_PIXEL_ID ||
    process.env.NEXT_PUBLIC_X_PIXEL_ID
  );

  const items = [
    {
      title: "قياس الزيارات",
      detail: "Google Analytics يعمل فقط عند وجود معرّف GA4 في بيئة التشغيل.",
      state: gaConfigured ? "مهيأ" : "غير مهيأ",
      tone: gaConfigured ? "ready" : "off",
    },
    {
      title: "Google Tag Manager",
      detail: "وجود متغير البيئة وحده لا يعني تشغيل GTM؛ حقن GTM غير مفعّل في الموقع حاليًا.",
      state: gtmConfigured ? "مهيأ فقط" : "غير مهيأ",
      tone: gtmConfigured ? "pending" : "off",
    },
    {
      title: "Google Ads",
      detail: "لم يتم ربط تحويل Google Ads بعد. التحويل الرئيسي الداخلي هو generate_lead.",
      state: adsConfigured ? "مهيأ فقط" : "غير مهيأ",
      tone: adsConfigured ? "pending" : "off",
    },
    {
      title: "Pixels الإعلانية",
      detail: "Meta وTikTok وSnap وX غير مفعلة في الموقع حتى لو وُجدت معرفاتها في البيئة.",
      state: adPixelsConfigured ? "مهيأة فقط" : "غير مهيأة",
      tone: adPixelsConfigured ? "pending" : "off",
    },
    {
      title: "الإسناد التسويقي First-touch",
      detail: "يحفظ الموقع UTM وgclid وwbraid وgbraid لأول زيارة داخل sessionStorage ثم يرفقها بطلب الخدمة عند الإرسال.",
      state: "مفعّل",
      tone: "ready",
    },
    {
      title: "JavaScript خام من لوحة الإدارة",
      detail: "لا توجد خانة لإدخال سكربتات أو أكواد تنفيذية من لوحة الإدارة أو قاعدة البيانات.",
      state: "محظور",
      tone: "ready",
    },
  ] as const;

  return (
    <main className="adminPage">
      <div className="container adminContainer">
        <div className="adminTopbar"><div><p className="eyebrow">التسويق</p><h1>الإعدادات</h1></div></div>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}><span>سياسة الخصوصية</span><strong className={styles.statusText}>منشورة</strong></div>
          <div className={styles.summaryCard}><span>إدارة موافقة Analytics</span><strong className={styles.statusText}>مطبقة</strong></div>
          <div className={styles.summaryCard}><span>Pixels إعلانية مفعلة</span><strong>0</strong></div>
          <div className={styles.summaryCard}><span>JavaScript خام</span><strong className={styles.statusText}>محظور</strong></div>
        </div>

        <section className={styles.panel}>
          <h2>إعدادات القياس والخصوصية</h2>
          <p className={styles.muted}>هذه الصفحة تعرض الحالة الفعلية الحالية ولا تحفظ مفاتيح أو أسرار. إعدادات البيئة تدار خارج قاعدة البيانات.</p>
          <div className={styles.settingsList}>
            {items.map((item) => (
              <article className={styles.settingRow} key={item.title}>
                <div><h3>{item.title}</h3><p>{item.detail}</p></div>
                <span className={item.tone === "ready" ? styles.readyBadge : item.tone === "pending" ? styles.pendingBadge : styles.offBadge}>{item.state}</span>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <h2>الموافقة والخصوصية</h2>
          <p className={styles.muted}>الموقع لديه طبقة موافقة فعلية تمنع تحميل Google Analytics قبل موافقة المستخدم، وتتيح رفض التحليلات أو تغيير القرار لاحقًا من إعدادات الخصوصية. Pixels الإعلانية ما زالت غير مفعلة، ويجب ربطها بطبقة الموافقة نفسها قبل تشغيلها.</p>
          <div className={styles.actions}>
            <Link className="button secondary" href="/privacy" target="_blank">فتح سياسة الخصوصية</Link>
            <Link className="button secondary" href="/admin/marketing/integrations">مراجعة التكاملات</Link>
          </div>
        </section>

        <section className={styles.panel}>
          <h2>قاعدة الأمان المعتمدة</h2>
          <p className={styles.muted}>المعرفات العامة فقط يمكن أن تصل للعميل. أي مفتاح سري يجب أن يبقى في بيئة الخادم. ولا يتم إرسال الاسم أو الجوال أو البريد أو العنوان أو الصور أو رقم الطلب إلى أحداث القياس.</p>
        </section>
      </div>
    </main>
  );
}
