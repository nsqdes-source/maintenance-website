"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AdminProfile = { full_name: string | null; role: string | null };

const links = [
  { href: "/admin", label: "نظرة عامة", exact: true },
  { href: "/admin/requests", label: "الطلبات" },
  { href: "/admin/technicians", label: "الفنيون" },
  { href: "/admin/users", label: "المستخدمون" },
  { href: "/admin/catalog", label: "الخدمات والأسعار" },
  { href: "/admin/dashboard", label: "عرض اللوحات" },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNavigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (pathname === "/admin/login") return;
    let mounted = true;
    async function loadProfile() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      const { data } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();
      if (mounted) setProfile(data);
    }
    loadProfile();
    return () => { mounted = false; };
  }, [pathname]);

  if (pathname === "/admin/login") return <>{children}</>;
  const canViewFinance = profile?.role === "admin_manager" || profile?.role === "super_admin";
  const canEditSite = profile?.role === "super_admin";

  return <>
    <style>{`.header { display: none; }`}</style>
    <div className="adminSharedLayout">
    <aside className="adminSharedSidebar">
      <Link className="adminOpsBrand" href="/admin"><span className="adminBrandLogo"><img src="/mueen-logo.png" alt="" /></span><strong>معين</strong></Link>
      <div className="adminOpsUser"><small>مساحتك في معين</small><strong>{profile?.full_name || "الإدارة"}</strong><span>{profile?.role === "super_admin" ? "مسؤول النظام" : "إدارة التشغيل"}</span></div>
      <nav aria-label="تنقل الإدارة">
        {links.map((link) => <Link key={link.href} className={isActive(pathname, link.href, link.exact) ? "active" : ""} href={link.href}>{link.label}</Link>)}
        {canEditSite ? <Link className={isActive(pathname, "/admin/site") ? "active" : ""} href="/admin/site">محرر الموقع</Link> : null}
        {canViewFinance ? <Link className={isActive(pathname, "/admin/finance") ? "active" : ""} href="/admin/finance">المالية</Link> : null}
      </nav>
      <div className="adminOpsActions"><Link className="adminOpsNew" href="/request">＋ طلب جديد</Link><button className="adminOpsSignOut" type="button" disabled={signingOut} onClick={async () => { setSigningOut(true); await createClient().auth.signOut(); window.location.href = "/"; }}>{signingOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}</button></div>
    </aside>
    <div className="adminSharedContent">{children}</div>
    </div>
  </>;
}
