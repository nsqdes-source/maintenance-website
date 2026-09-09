import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountSignOut from "./AccountSignOut";

export const dynamic = "force-dynamic";

const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  awaiting_assignment: "جاري التنفيذ — بانتظار إسناد الفني",
  assigned: "جاري التنفيذ — تم إسناد الفني",
  technician_accepted: "الفني في الطريق",
  completed: "تم التنفيذ",
  needs_followup: "بحاجة إلى متابعة / قطعة",
  customer_rejected: "رفض العميل التنفيذ",
  cancelled: "ملغي",
};

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error: profileError }, { data: requests, error: requestsError }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, role").eq("id", user.id).maybeSingle(),
    supabase.from("service_requests").select("id, customer_name, phone, service_type, problem_description, city, address, workflow_stage, created_at").eq("customer_id", user.id).order("created_at", { ascending: false }),
  ]);

  if (profileError || requestsError) {
    return <main className="adminPage"><div className="container adminContainer"><div className="form-error" role="alert">تعذر تحميل بيانات الحساب حاليًا. حاول مرة أخرى لاحقًا.</div></div></main>;
  }

  return <main className="adminPage"><div className="container adminContainer">
    <div className="adminTopbar"><div><p className="eyebrow">حساب العميل</p><h1>مرحبًا {profile?.full_name || user.email}</h1></div><div><a className="button secondary" href="/request">طلب خدمة جديدة</a><AccountSignOut /></div></div>
    <div className="emptyState"><h2>بيانات الحساب</h2><p>البريد الإلكتروني: {user.email}</p>{profile?.phone && <p>رقم الجوال: {profile.phone}</p>}</div>
    <section className="requestTableWrap">
      <div className="requestTableHeader"><span>{requests?.length ?? 0} طلب</span><span>طلباتك فقط</span></div>
      {!requests?.length ? <div className="emptyState"><h2>لا توجد طلبات</h2><p>يمكنك إرسال أول طلب خدمة من نموذج طلب الخدمة.</p></div> : (
        <div className="requestList">{requests.map((request) => <article className="requestAdminCard" key={request.id}>
          <div className="requestAdminMain">
            <div className="requestAdminTitle"><h2>{request.service_type}</h2><span className={`statusBadge status-${request.workflow_stage}`}>{CUSTOMER_STATUS_LABELS[request.workflow_stage] ?? request.workflow_stage}</span></div>
            <p className="requestMeta">{request.city} · {new Date(request.created_at).toLocaleString("ar-SA")}</p>
            <p>{request.problem_description}</p>
          </div>
          <div className="requestAdminDetails"><div><strong>العنوان</strong><span>{request.address}</span></div><div><strong>رقم الجوال</strong><span>{request.phone}</span></div></div>
        </article>)}</div>
      )}
    </section>
  </div></main>;
}
