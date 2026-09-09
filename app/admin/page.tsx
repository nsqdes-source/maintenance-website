import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const ADMIN_ROLES = new Set(["maintenance_manager", "admin_manager", "super_admin"]);

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) redirect("/account");

  const [{ count: requestsCount }, { count: techniciansCount }, { count: usersCount }, { count: newRequestsCount }] = await Promise.all([
    supabase.from("service_requests").select("id", { count: "exact", head: true }),
    supabase.from("technicians").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);

  const cards = [
    { href: "/admin/requests", label: "إدارة الطلبات", value: requestsCount ?? 0, detail: `${newRequestsCount ?? 0} طلب جديد` },
    { href: "/admin/technicians", label: "إدارة الفنيين", value: techniciansCount ?? 0, detail: "فني مسجل" },
    { href: "/admin/users", label: "إدارة المستخدمين", value: usersCount ?? 0, detail: "مستخدم مسجل" },
  ];

  return (
    <main className="adminPage"><div className="container adminContainer">
      <div className="adminTopbar"><div><p className="eyebrow">لوحة الإدارة</p><h1>مرحبًا {profile.full_name || "بك"}</h1></div></div>
      <div className="grid">
        {cards.map((card) => <a className="card" href={card.href} key={card.href}><p className="serviceNumber">{card.value}</p><h3>{card.label}</h3><p>{card.detail}</p></a>)}
      </div>
      <section className="ctaSection"><div className="ctaBox"><div><p className="eyebrow">إدارة التشغيل</p><h2>ابدأ من القسم المناسب</h2><p>إدارة الطلبات والفنيين والمستخدمين من مكان واحد.</p></div><a className="button lightButton" href="/admin/requests">فتح إدارة الطلبات</a></div></section>
    </div></main>
  );
}
