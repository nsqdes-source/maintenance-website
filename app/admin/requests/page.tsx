import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RequestStatusControl from "@/app/admin/RequestStatusControl";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = new Set([
  "maintenance_manager",
  "admin_manager",
  "super_admin",
]);

const STATUS_LABELS: Record<string, string> = {
  new: "جديد",
  contacted: "تم التواصل",
  scheduled: "مجدول",
  completed: "مكتمل",
  cancelled: "ملغي",
};

export default async function AdminRequestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) redirect("/account");

  const { data: requests, error } = await supabase
    .from("service_requests")
    .select("id, customer_name, phone, service_type, problem_description, city, address, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="adminPage">
      <div className="container adminContainer">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">إدارة الطلبات</p>
            <h1>طلبات الخدمة</h1>
          </div>
          <div className="adminActions">
            <a className="button secondary" href="/admin">لوحة الإدارة</a>
          </div>
        </div>

        {error ? (
          <div className="form-error">تعذر تحميل الطلبات.</div>
        ) : !requests?.length ? (
          <div className="emptyState"><h2>لا توجد طلبات حتى الآن</h2><p>ستظهر طلبات العملاء هنا عند إرسالها من نموذج الموقع.</p></div>
        ) : (
          <div className="requestTableWrap">
            <div className="requestTableHeader">
              <span>{requests.length} طلب</span>
              <span>الأحدث أولًا</span>
            </div>
            <div className="requestList">
              {requests.map((request) => (
                <article className="requestAdminCard" key={request.id}>
                  <div className="requestAdminMain">
                    <div className="requestAdminTitle">
                      <h2>{request.customer_name}</h2>
                      <span className="statusBadge">{STATUS_LABELS[request.status] ?? request.status}</span>
                    </div>
                    <p className="requestMeta">{request.service_type} · {request.city} · {new Date(request.created_at).toLocaleString("ar-SA")}</p>
                    <p>{request.problem_description}</p>
                    <RequestStatusControl requestId={request.id} currentStatus={request.status} />
                  </div>
                  <div className="requestAdminDetails">
                    <a href={`tel:${request.phone}`}><strong>الجوال</strong><span>{request.phone}</span></a>
                    <div><strong>العنوان</strong><span>{request.address}</span></div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
