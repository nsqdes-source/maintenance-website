import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FooterSettingsForm from "./FooterSettingsForm";

export const dynamic = "force-dynamic";
const ADMIN_ROLES = new Set(["maintenance_manager", "admin_manager", "super_admin"]);
const STAGE_LABELS: Record<string, string> = { awaiting_assignment: "طلب جديد", assigned: "بانتظار رد الفني", technician_accepted: "تم قبول الفني", in_progress: "قيد التنفيذ", awaiting_completion_review: "بانتظار مراجعة الإغلاق", needs_followup: "تحتاج قطعة أو تعديل", reschedule_requested: "تحتاج إعادة جدولة", unable_to_complete: "تعذر التنفيذ", awaiting_admin_quote: "بانتظار عرض", awaiting_customer_approval: "بانتظار موافقة العميل", quote_approved: "وافق العميل" };

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) redirect("/account");
  const attentionStages = Object.keys(STAGE_LABELS);
  const [{ count: requestsCount }, { count: techniciansCount }, { count: usersCount }, { count: newRequestsCount }, { count: completedRequestsCount }, { data: attentionRequests }, { data: footerContent }] = await Promise.all([
    supabase.from("service_requests").select("id", { count: "exact", head: true }).is("archived_at", null).not("workflow_stage", "in", "(completed,customer_rejected,customer_cancelled,cancelled)"),
    supabase.from("technicians").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("workflow_stage", "awaiting_assignment").is("archived_at", null),
    supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("workflow_stage", "completed").is("archived_at", null),
    supabase.from("service_requests").select("id,customer_name,service_type,workflow_stage,created_at").in("workflow_stage", attentionStages).is("archived_at", null).order("workflow_updated_at", { ascending: false }).limit(6),
    supabase
  .from("site_footer_content")
  .select(
    "company_name, description, phone, email, address, copyright_text, business_center_label, business_center_url, business_center_logo_url, payment_methods, payment_logo_urls, social_links"
  )
  .eq("id", true)
  .maybeSingle(),
  ]);
  const initialFooter = {
  company_name: footerContent?.company_name ?? "معين لخدمات الصيانة",
  description: footerContent?.description ?? "معين.. الصيانة أسهل",
  phone: footerContent?.phone ?? "",
  email: footerContent?.email ?? "",
  address: footerContent?.address ?? "",
  copyright_text:
    footerContent?.copyright_text ?? "© 2026 جميع الحقوق محفوظة",
  business_center_label:
    footerContent?.business_center_label ?? "مركز الأعمال",
  business_center_url:
    footerContent?.business_center_url ?? "/admin/login",
  business_center_logo_url:
    footerContent?.business_center_logo_url ?? "",
  payment_methods: Array.isArray(footerContent?.payment_methods)
    ? (footerContent.payment_methods as string[])
    : ["mada", "visa", "mastercard", "apple_pay", "bank_transfer"],
  payment_logo_urls:
    footerContent?.payment_logo_urls &&
    typeof footerContent.payment_logo_urls === "object" &&
    !Array.isArray(footerContent.payment_logo_urls)
      ? (footerContent.payment_logo_urls as Record<string, string>)
      : {},
  social_links: Array.isArray(footerContent?.social_links)
    ? (footerContent.social_links as {
        id: string;
        label: string;
        url: string;
        icon_url: string;
      }[])
    : [],
};
  return <main className="adminOpsPage"><section className="adminOpsContent"><header className="adminOpsHeader"><div><p>مركز العمليات</p><h1>نظرة عامة</h1></div><Link href="/admin/requests" className="button secondary">كل الطلبات</Link></header>
      <div className="opsStats"><Link href="/admin/requests?status=awaiting_assignment"><small>طلبات جديدة</small><strong>{newRequestsCount ?? 0}</strong><span>تحتاج إسنادًا</span></Link><Link href="/admin/requests"><small>كل الطلبات</small><strong>{requestsCount ?? 0}</strong><span>طلبات نشطة</span></Link><Link href="/admin/requests?status=completed"><small>طلبات منتهية</small><strong>{completedRequestsCount ?? 0}</strong><span>تم اعتماد تنفيذها</span></Link><Link href="/admin/technicians"><small>فنيون متاحون</small><strong>{techniciansCount ?? 0}</strong><span>فني نشط</span></Link>{(profile.role === "admin_manager" || profile.role === "super_admin") ? <Link href="/admin/finance"><small>المالية</small><strong>﷼</strong><span>الفواتير والتحصيل</span></Link> : <Link href="/admin/users"><small>المستخدمون</small><strong>{usersCount ?? 0}</strong><span>حساب مسجل</span></Link>}</div>
      <div className="opsWorkspace"><section className="opsAttention"><div className="opsSectionHeader"><div><p>آخر الحركة</p><h2>طلبات تحتاج انتباهك</h2></div><Link href="/admin/requests">عرض الكل</Link></div>{attentionRequests?.length ? <div className="opsRequestList">{attentionRequests.map(request => <Link href={`/admin/requests/${request.id}`} key={request.id} className="opsRequest"><span className="opsRequestIcon">🔧</span><div><strong>{request.service_type}</strong><small>{request.customer_name} · #{request.id.slice(0,8)}</small></div><span className={`statusBadge status-${request.workflow_stage}`}>{STAGE_LABELS[request.workflow_stage] ?? request.workflow_stage}</span></Link>)}</div> : <p className="detailMuted">لا توجد طلبات تحتاج إجراءً الآن.</p>}</section>
        <aside className="opsInsight"><p>تشغيل اليوم</p><h2>الصورة كاملة، والقرار أسرع.</h2><span>كل طلب ينتقل في مسار واضح، من البلاغ حتى الإغلاق والتحصيل.</span><div><strong>{techniciansCount ?? 0}</strong><small>فني متاح</small><strong>{newRequestsCount ?? 0}</strong><small>طلب جديد</small></div></aside></div>
      <details className="adminSettingsDisclosure"><summary>إعدادات النص السفلي للموقع</summary><FooterSettingsForm initialContent={initialFooter} /></details>
    </section></main>;
}
