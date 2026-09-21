import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CustomerRequestActions from "./CustomerRequestActions";
import CustomerQuoteDecision from "./CustomerQuoteDecision";
import RequestImages from "@/app/components/RequestImages";
import WarrantyClaimForm from "./WarrantyClaimForm";
import PortalNavigation from "@/app/components/PortalNavigation";
import { getLocale, text } from "@/lib/locale";
import { CUSTOMER_DASHBOARD_CARDS, dashboardCardStyle, normalizeDashboardCards } from "@/lib/dashboard-display";
import { requestReference } from "@/lib/request-reference";

export const dynamic = "force-dynamic";

const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  awaiting_assignment: "جاري التنفيذ — بانتظار إسناد الفني",
  assigned: "جاري التنفيذ — تم إسناد الفني",
  technician_accepted: "تم قبول الإسناد — جارٍ تأكيد الموعد",
  awaiting_completion_review: "بانتظار مراجعة الإدارة",
  reschedule_requested: "طلب الفني إعادة جدولة الموعد",
  unable_to_complete: "تعذر التنفيذ",
  completed: "تم التنفيذ",
  in_progress: "قيد التنفيذ",
  awaiting_admin_quote: "بانتظار عرض الإصلاح",
  awaiting_customer_approval: "بانتظار موافقتك على العرض",
  quote_approved: "تمت الموافقة على العرض",
  needs_followup: "بحاجة إلى متابعة / قطعة",
  customer_rejected: "رفض العميل الإصلاح",
  customer_cancelled: "ألغاه العميل",
  cancelled: "تم إلغاء الطلب",
};

const CUSTOMER_STATUS_LABELS_EN: Record<string, string> = {
  awaiting_assignment: "Awaiting technician assignment", assigned: "Technician assigned", technician_accepted: "Assignment accepted — appointment being confirmed", awaiting_completion_review: "Awaiting admin review", reschedule_requested: "Technician requested rescheduling", unable_to_complete: "Unable to complete", completed: "Completed", in_progress: "In progress", awaiting_admin_quote: "Awaiting repair quote", awaiting_customer_approval: "Awaiting your approval", quote_approved: "Quote approved", needs_followup: "Parts or follow-up needed", customer_rejected: "Repair declined", customer_cancelled: "Cancelled by customer", cancelled: "Cancelled",
};

export default async function AccountPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => text(locale, ar, en);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.email_confirmed_at) await supabase.rpc("claim_verified_guest_service_requests");

  const [{ data: profile, error: profileError }, { data: requests, error: requestsError }, { data: dashboardDisplay }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, role").eq("id", user.id).maybeSingle(),
    supabase.from("service_requests").select("id, customer_name, phone, service_type, problem_description, city, address, latitude, longitude, workflow_stage, visit_outcome, visit_notes, created_at").eq("customer_id", user.id).order("created_at", { ascending: false }),
    supabase.from("dashboard_display_settings").select("customer_cards").eq("id", true).maybeSingle(),
  ]);

  if (profileError || requestsError) {


  return <main className="adminPage customerPortal"><div className="container adminContainer"><div className="form-error" role="alert">{t("تعذر تحميل بيانات الحساب حاليًا. حاول مرة أخرى لاحقًا.", "Could not load your account. Please try again later.")}</div></div></main>;
  }

  if (profile?.role === "customer" && !profile.phone) redirect("/account/edit");

  const { data: quotes } = requests?.length ? await supabase.from("service_request_quotes").select("id, service_request_id, description, parts_description, parts_cost, labor_cost, status").in("service_request_id", requests.map(item => item.id)).eq("status", "pending") : { data: [] };
  const quoteByRequest = new Map((quotes ?? []).map(quote => [quote.service_request_id, quote]));
  const dashboardCards = normalizeDashboardCards(dashboardDisplay?.customer_cards, CUSTOMER_DASHBOARD_CARDS);

  return <main className="adminPage customerPortal"><div className="container adminContainer"><PortalNavigation kind="customer" />
    <div className="adminTopbar dashboardDisplayCard" style={dashboardCardStyle(dashboardCards, "new_request")}>
      <div><p className="eyebrow">{t("حساب المستخدم", "User account")}</p><h1>{t("مرحبًا", "Welcome,")} {profile?.full_name || user.email}</h1></div>
      <Link href="/request" className="button button-primary">{t("إنشاء طلب", "New request")}</Link>
    </div>
    <section className="requestTableWrap dashboardDisplayCard" style={dashboardCardStyle(dashboardCards, "requests")}>
      <div className="requestTableHeader"><span>{requests?.length ?? 0} {t("طلب", "requests")}</span><span>{t("طلباتك فقط", "Your requests only")}</span></div>
      {!requests?.length ? <div className="emptyState"><h2>{t("لا توجد طلبات", "No requests")}</h2><p>{t("يمكنك إرسال أول طلب خدمة من نموذج طلب الخدمة.", "You can submit your first maintenance request from the request form.")}</p></div> : (
        <div className="requestList">{requests.map((request) => {
          const hasCoordinates = Number.isFinite(request.latitude) && Number.isFinite(request.longitude);
          const mapUrl = hasCoordinates ? `https://www.google.com/maps/search/?api=1&query=${request.latitude},${request.longitude}` : null;
          return <article className="requestAdminCard" id={`request-${request.id}`} key={request.id}>
            <div className="requestAdminMain">
              <div className="requestAdminTitle"><h2>{request.service_type}<small dir="ltr">{requestReference(request.id)}</small></h2><span className={`statusBadge status-${request.workflow_stage}`}>{(locale === "ar" ? CUSTOMER_STATUS_LABELS : CUSTOMER_STATUS_LABELS_EN)[request.workflow_stage] ?? request.workflow_stage}</span></div>
              <p className="requestMeta">{request.city} · {new Date(request.created_at).toLocaleString(locale === "ar" ? "ar-SA" : "en-US")}</p>
              <p>{request.problem_description}</p>
              <RequestImages requestId={request.id} />
              {request.visit_outcome === "needs_followup" && request.visit_notes ? <div className="followupNotice"><strong>{t("نتيجة الزيارة:", "Visit result:")}</strong><p>{request.visit_notes}</p></div> : null}
              {request.workflow_stage === "awaiting_customer_approval" && quoteByRequest.get(request.id) ? <CustomerQuoteDecision quote={quoteByRequest.get(request.id)!} /> : null}
              <CustomerRequestActions requestId={request.id} workflowStage={request.workflow_stage} />
              {request.workflow_stage === "completed" ? <WarrantyClaimForm requestId={request.id} /> : null}
            </div>
            <div className="requestAdminDetails">
              <div><strong>{t("العنوان", "Address")}</strong><span>{request.address}</span></div>
              <div><strong>{t("رقم الجوال", "Phone number")}</strong><span>{request.phone}</span></div>
              <div><strong>{t("موقع الخدمة", "Service location")}</strong>{hasCoordinates ? <><span dir="ltr">{request.latitude.toFixed(6)}, {request.longitude.toFixed(6)}</span><a href={mapUrl!} target="_blank" rel="noreferrer" className="requestMapLink">{t("فتح الموقع في خرائط Google", "Open in Google Maps")}</a></> : <span>{t("غير محدد", "Not specified")}</span>}</div>
            </div>
          </article>;
        })}</div>
      )}
    </section>
    <style>{`.followupNotice{margin-top:14px;padding:12px 14px;border-radius:10px;background:rgba(0,0,0,.035);line-height:1.7}.followupNotice p{margin:4px 0 0;white-space:pre-wrap}.requestMapLink{display:inline-block;margin-top:6px;font-weight:700}`}</style>
  </div></main>;
}
