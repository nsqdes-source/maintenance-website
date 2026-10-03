import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import styles from "../Marketing.module.css";

export const dynamic = "force-dynamic";

export default async function MarketingSettingsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("site_settings").select("key,value").in("key", [
    "marketing_ga_measurement_id",
    "marketing_gtm_id",
    "marketing_google_ads_id",
    "marketing_meta_pixel_id",
    "marketing_tiktok_pixel_id",
    "marketing_snap_pixel_id",
    "marketing_x_pixel_id",
  ]);
  const values = Object.fromEntries((rows ?? []).map((row) => [row.key, row.value]));
  const gaConfigured = Boolean(values.marketing_ga_measurement_id);
  const gtmConfigured = Boolean(values.marketing_gtm_id);
  const adsConfigured = Boolean(values.marketing_google_ads_id);
  const adPixelsConfigured = Boolean(values.marketing_meta_pixel_id || values.marketing_tiktok_pixel_id || values.marketing_snap_pixel_id || values.marketing_x_pixel_id);

  const items = [
    { title: "قياس الزيارات", detail: "Google Analytics يعمل فقط عند حفظ معرّف GA4 من لوحة التكاملات وبعد موافقة المستخدم على ملفات التحليلات.", state: gaConfigured ? "مهيأ" : "غير مهيأ", tone: gaConfigured ? "ready" : "off" },
    { title: "Google Tag Manager", detail: "يمكن حفظ المعرّف من لوحة التكاملات، لكن حقن GTM غير مفعّل حاليًا.", state: gtmConfigured ? "محفوظ فقط" : "غير مهيأ", tone: gtmConfigured ? "pending" : "off" },
    { title: "Google Ads", detail: "يمكن حفظ معرّف Ads من لوحة التكاملات. ربط تحويل generate_lead سيأتي في المرحلة التالية.", state: adsConfigured ? "محفوظ فقط" : "غير مهيأ", tone: adsConfigured ? "pending" : "off" },
    { title: "Pixels الإعلانية", detail: "Meta وTikTok وSnap وX لا تعمل بعد حتى لو حُفظت معرفاتها.", state: adPixelsConfigured ? "محفوظة فقط" : "غير مهيأة", tone: adPixelsConfigured ? "pending" : "off" },
    { title: "الإسناد التسويقي First-touch", detail: "يحفظ الموقع UTM وgclid وwbraid وgbraid لأول زيارة داخل sessionStorage ثم يرفقها بطلب الخدمة عند الإرسال.", state: "مفعّل", tone: "ready" },
    { title: "JavaScript خام من لوحة الإدارة", detail: "لا توجد خانة لإدخال سكربتات أو أكواد تنفيذية من لوحة الإدارة أو قاعدة البيانات.", state: "محظور", tone: "ready" },
  ] as const;

  return (
    <main className="adminPage">
      <div className="container adminContainer">
        <div className="adminTopbar"><div><p className="eyebrow">التسويق</p><h1>الإعدادات</h1></div></div>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}><span>سياسة الخصوصية</span><strong className={styles.statusText}>منشورة</strong></div>
          <div className={styles.summaryCard}><span>إدارة موافقة ملفات الارتباط</span><strong className={styles.statusText}>مطبقة</strong></div>
          <div className={styles.summaryCard}><span>Pixels إعلانية مفعلة</span><strong>0</strong></div>
          <div className={styles.summaryCard}><span>JavaScript خام</span><strong className={styles.statusText}>محظور</strong></div>
        </div>

        <section className={styles.panel}>
          <h2>إعدادات القياس والخصوصية</h2>
          <p className={styles.muted}>الحالة أدناه مبنية على المعرفات المحفوظة من لوحة التكاملات، وليس على متغيرات البيئة.</p>
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
          <p className={styles.muted}>الموقع لديه إشعار ملفات ارتباط بالشكل المعتاد، مع قبول الكل ورفض غير الضروري والتخصيص. ملفات التحليلات لا تُحمّل قبل الموافقة، ويمكن تغيير القرار لاحقًا من إعدادات ملفات الارتباط.</p>
          <div className={styles.actions}>
            <Link className="button secondary" href="/privacy" target="_blank">فتح سياسة الخصوصية</Link>
            <Link className="button secondary" href="/admin/marketing/integrations">إدارة التكاملات</Link>
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
