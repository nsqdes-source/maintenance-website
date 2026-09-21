import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_DEFINITIONS } from "@/lib/role-permissions";

export const dynamic = "force-dynamic";

export default async function RolePermissionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "super_admin") redirect("/admin");

  return <main className="adminPage"><div className="container adminContainer">
    <div className="adminTopbar"><div><p className="eyebrow">الأمان والحوكمة</p><h1>الأدوار والصلاحيات</h1></div></div>
    <section className="card permissionIntro"><h2>قاعدة الصلاحيات</h2><p>تعرض هذه الصفحة الحدود المعتمدة لكل دور. المنع الفعلي لا يعتمد على إخفاء الأزرار فقط؛ بل تطبقه أيضًا سياسات قاعدة البيانات والدوال المحمية.</p></section>
    <div className="rolePermissionGrid">{ROLE_DEFINITIONS.map((definition) => <article className="card rolePermissionCard" key={definition.role}>
      <p className="eyebrow" dir="ltr">{definition.role}</p><h2>{definition.label}</h2><p>{definition.purpose}</p>
      <h3>مسموح</h3><ul>{definition.permissions.map((permission) => <li key={permission}>✓ {permission}</li>)}</ul>
      <h3>الحدود</h3><ul className="roleRestrictions">{definition.restrictions.map((restriction) => <li key={restriction}>— {restriction}</li>)}</ul>
    </article>)}</div>
  </div></main>;
}
