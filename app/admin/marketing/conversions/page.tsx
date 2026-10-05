import { createClient } from "@/lib/supabase/server";
import { MARKETING_FUNNEL_EVENTS } from "@/lib/marketing-events";
import styles from "../Marketing.module.css";

export const dynamic = "force-dynamic";

export default async function MarketingConversionsPage() {
  const supabase = await createClient();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data, error }, { data: settingsRows }] = await Promise.all([
    supabase.from("service_requests").select("utm_source,utm_medium,utm_campaign,gclid,wbraid,gbraid").gte("created_at", from),
    supabase.from("site_settings").select("key,value").in("key", ["marketing_ga_measurement_id"]),
  ]);
  const rows = data ?? [];
  const attributedLeads = rows.filter((row) => Boolean(row.utm_source || row.utm_medium || row.utm_campaign || row.gclid || row.wbraid || row.gbraid)).length;
  const gaConfigured = Boolean(settingsRows?.find((row) => row.key === "marketing_ga_measurement_id")?.value?.trim());

  return (
    <main className="adminPage">
      <div className="container adminContainer">
        <div className="adminTopbar"><div><p className="eyebrow">التسويق</p><h1>التحويلات والأحداث</h1></div></div>
        {error ? <div className="form-error">تعذر تحميل مؤشرات التحويل.</div> : null}
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}><span>طلبات ناجحة آخر 30 يومًا</span><strong>{rows.length}</strong></div>
          <div className={styles.summaryCard}><span>طلبات بإسناد تسويقي</span><strong>{attributedLeads}</strong></div>
          <div className={styles.summaryCard}><span>أحداث Funnel معرفة</span><strong>{MARKETING_FUNNEL_EVENTS.length}</strong></div>
          <div className={styles.summaryCard}><span>Google Analytics</span><strong className={styles.statusText}>{gaConfigured ? "مهيأ" : "غير مهيأ"}</strong></div>
        </div>
        <section className={styles.panel}>
          <h2>قاموس أحداث التحويل</h2>
          <p className={styles.muted}>الأحداث ترسل إلى طبقة القياس فقط عند توفر gtag. لا ترسل الاسم أو الجوال أو البريد أو العنوان أو الصور أو رقم الطلب.</p>
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th>الحدث</th><th>المرحلة</th><th>المصدر</th><th>الحالة</th></tr></thead>
            <tbody>{MARKETING_FUNNEL_EVENTS.map((event) => (
              <tr key={event.name}>
                <td><strong>{event.label}</strong><br /><code dir="ltr">{event.name}</code></td>
                <td>{event.stage}</td>
                <td>{event.source}</td>
                <td><span className={styles.readyBadge}>مفعّل في الكود</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
        <section className={styles.panel}>
          <h2>تعريف التحويل الرئيسي</h2>
          <p className={styles.muted}>التحويل الرئيسي حاليًا هو <code dir="ltr">generate_lead</code>، ولا يطلق إلا بعد نجاح إنشاء طلب الخدمة. عدد الطلبات أعلاه مأخوذ من النظام نفسه، وليس من Google Analytics.</p>
        </section>
      </div>
    </main>
  );
}
