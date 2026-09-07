import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const { data: requests, error } = await supabase
    .from("service_requests")
    .select("id, customer_name, phone, service_type, problem_description, city, address, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="adminPage">
      <div className="container adminContainer">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">لوحة الإدارة</p>
            <h1>طلبات الخدمة</h1>
          </div>
          <a className="button secondary" href="/">الموقع الرئيسي</a>
        </div>

        {error ? (
          <div className="form-error">تعذر تحميل الطلبات. تأكد من صلاحيات Supabase الخاصة بحساب الإدارة.</div>
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
                    <div className="requestAdminTitle"><h2>{request.customer_name}</h2><span className="statusBadge">طلب جديد</span></div>
                    <p className="requestMeta">{request.service_type} · {request.city} · {new Date(request.created_at).toLocaleString("ar-SA")}</p>
                    <p>{request.problem_description}</p>
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
