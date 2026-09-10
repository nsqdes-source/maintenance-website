import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CustomerRequestActions from "./CustomerRequestActions";

export const dynamic = "force-dynamic";

const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  awaiting_assignment: "جاري التنفيذ — بانتظار إسناد الفني",
  assigned: "جاري التنفيذ — تم إسناد الفني",
  technician_accepted: "الفني في الطريق",
  completed: "تم التنفيذ",
  needs_followup: "بحاجة إلى متابعة / قطعة",
  customer_rejected: "رفض العميل الإصلاح",
  customer_cancelled: "ألغاه العميل",
  cancelled: "تم إلغاء الطلب",
};

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error: profileError }, { data: requests, error: requestsError }] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle(),
    supabase.from("service_requests").select("id, customer_name, phone, service_type, problem_description, city, address, workflow_stage, visit_outcome, visit_notes, created_at").eq("customer_id", user.id).order("created_at", { ascending: false }),
  ]);

  if (profileError || requestsError) {
    return <main className="adminPage"><div className="container adminContainer"><div className="form-error" role="alert">تعذر تحميل بيانات الحساب حاليًا. حاول مرة أخرى لاحقًا.</div></div></main>;
  }

  return <main className="adminPage"><div className="container adminContainer">
    <div className="adminTopbar">
      <div><p className="eyebrow">حساب المستخدم</p><h1>مرحبًا {profile?.full_name || user.email}</h1></div>
      <Link href="/request" className="button button-primary">إنشاء طلب</Link>
    </div>
    <section className="requestTableWrap">
      <div className="requestTableHeader"><span>{requests?.length ?? 0} طلب</span><span>طلباتك فقط</span></div>
      {!requests?.length ? <div className="emptyState"><h2>لا توجد طلبات</h2><p>يمكنك إرسال أول طلب خدمة من نموذج طلب الخدمة.</p></div> : (
        <div className="requestList">{requests.map((request) => <article className="requestAdminCard" key={request.id}>
          <div className="requestAdminMain">
            <div className="requestAdminTitle"><h2>{request.service_type}</h2><span className={`statusBadge status-${request.workflow_stage}`}>{CUSTOMER_STATUS_LABELS[request.workflow_stage] ?? request.workflow_stage}</span></div>
            <p className="requestMeta">{request.city} · {new Date(request.created_at).toLocaleString("ar-SA")}</p>
            <p>{request.problem_description}</p>
            {request.visit_outcome === "needs_followup" && request.visit_notes ? <div className="followupNotice"><strong>نتيجة الزيارة:</strong><p>{request.visit_notes}</p></div> : null}
            <CustomerRequestActions requestId={request.id} workflowStage={request.workflow_stage} />
          </div>
          <div className="requestAdminDetails"><div><strong>العنوان</strong><span>{request.address}</span></div><div><strong>رقم الجوال</strong><span>{request.phone}</span></div></div>
        </article>)}</div>
      )}
    </section>
    <style>{`.followupNotice{margin-top:14px;padding:12px 14px;border-radius:10px;background:rgba(0,0,0,.035);line-height:1.7}.followupNotice p{margin:4px 0 0;white-space:pre-wrap}`}</style>
  </div></main>;
}
