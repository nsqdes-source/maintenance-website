import { createClient } from "@/lib/supabase/server";
import styles from "../Marketing.module.css";

export const dynamic = "force-dynamic";

type AttributionRow = { created_at: string; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; gclid: string | null; wbraid: string | null; gbraid: string | null; };
function increment(map: Map<string, number>, key: string) { map.set(key, (map.get(key) ?? 0) + 1); }
function topRows(map: Map<string, number>, limit = 10) { return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit); }

export default async function MarketingAnalyticsPage() {
  const supabase = await createClient();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from("service_requests").select("created_at,utm_source,utm_medium,utm_campaign,gclid,wbraid,gbraid").gte("created_at", from).order("created_at", { ascending: false });
  const rows = (data ?? []) as AttributionRow[];
  const sourceCounts = new Map<string, number>();
  const campaignCounts = new Map<string, number>();
  let attributed = 0;
  let paidClickIds = 0;
  for (const row of rows) {
    const hasAttribution = Boolean(row.utm_source || row.utm_medium || row.utm_campaign || row.gclid || row.wbraid || row.gbraid);
    if (hasAttribution) attributed += 1;
    if (row.gclid || row.wbraid || row.gbraid) paidClickIds += 1;
    const source = row.utm_source?.trim() || (row.gclid || row.wbraid || row.gbraid ? "google-ads" : "غير محدد");
    increment(sourceCounts, source);
    if (row.utm_campaign?.trim()) increment(campaignCounts, row.utm_campaign.trim());
  }
  const sourceRows = topRows(sourceCounts);
  const campaignRows = topRows(campaignCounts);
  return <main className="adminPage"><div className="container adminContainer">
    <div className="adminTopbar"><div><p className="eyebrow">التسويق</p><h1>التحليلات</h1></div></div>
    {error ? <div className="form-error">تعذر تحميل بيانات الإسناد التسويقي.</div> : null}
    <div className={styles.summaryGrid}>
      <div className={styles.summaryCard}><span>طلبات آخر 30 يومًا</span><strong>{rows.length}</strong></div>
      <div className={styles.summaryCard}><span>طلبات بإسناد تسويقي</span><strong>{attributed}</strong></div>
      <div className={styles.summaryCard}><span>طلبات بمعرّف نقرة إعلانية</span><strong>{paidClickIds}</strong></div>
      <div className={styles.summaryCard}><span>حملات UTM المسجلة</span><strong>{campaignCounts.size}</strong></div>
    </div>
    <section className={styles.panel}><h2>مصادر الطلبات</h2><p className={styles.muted}>يعتمد هذا التقرير على بيانات الإسناد المحفوظة مع طلب الخدمة، بدون عرض بيانات شخصية للعميل.</p><div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>المصدر</th><th>عدد الطلبات</th><th>النسبة</th></tr></thead><tbody>
      {sourceRows.map(([source, count]) => <tr key={source}><td>{source}</td><td>{count}</td><td>{rows.length ? ((count / rows.length) * 100).toFixed(1) + "%" : "0%"}</td></tr>)}
      {!sourceRows.length ? <tr><td className={styles.empty} colSpan={3}>لا توجد طلبات خلال الفترة.</td></tr> : null}
      </tbody></table></div></section>
    <section className={styles.panel}><h2>أكثر حملات UTM</h2><div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>الحملة</th><th>عدد الطلبات</th></tr></thead><tbody>
      {campaignRows.map(([campaign, count]) => <tr key={campaign}><td dir="ltr">{campaign}</td><td>{count}</td></tr>)}
      {!campaignRows.length ? <tr><td className={styles.empty} colSpan={2}>لا توجد حملات UTM مسجلة في آخر 30 يومًا.</td></tr> : null}
      </tbody></table></div></section>
  </div></main>;
}
