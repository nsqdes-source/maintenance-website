import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const ADMIN_ROLES = new Set(["maintenance_manager", "admin_manager", "super_admin"]);

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) redirect("/account");

  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role, created_at, updated_at")
    .order("created_at", { ascending: false });

  return (
    <main className="adminPage"><div className="container adminContainer">
      <div className="adminTopbar"><div><p className="eyebrow">إدارة المستخدمين</p><h1>المستخدمون</h1></div><a className="button secondary" href="/admin">لوحة الإدارة</a></div>
      {error ? <div className="form-error">تعذر تحميل المستخدمين.</div> : !users?.length ? <div className="emptyState"><h2>لا يوجد مستخدمون حتى الآن</h2><p>سيظهر العملاء وموظفو النظام هنا عند إنشاء حساباتهم.</p></div> : <div className="adminEntityGrid">{users.map((item) => <article className="adminEntityCard" key={item.id}><div className="adminEntityHeader"><div><h2>{item.full_name || "مستخدم بدون اسم"}</h2><p>{item.phone || "لا يوجد جوال"}</p></div><span className="roleBadge">{item.role}</span></div><div className="adminEntityBody"><strong>تاريخ التسجيل</strong><p>{new Date(item.created_at).toLocaleString("ar-SA")}</p><strong>الدور</strong><p>{item.role}</p></div></article>)}</div>}
    </div></main>
  );
}
