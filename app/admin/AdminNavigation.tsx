"use client";

import Link from "next/link";
import Image from "next/image";
import { getVisibleAdminSections, getActiveAdminSection, getActiveAdminRoute } from "@/lib/admin-navigation";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AdminProfile = { full_name: string | null; role: string | null };

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
  const sections = getVisibleAdminSections(profile?.role);
  const activeSection = getActiveAdminSection(pathname, sections);
  const activeRoute = getActiveAdminRoute(pathname, activeSection);

  return <>
    <style>{`.header { display: none; }`}</style>
    <div className="adminSharedLayout adminShell" dir="rtl">
    <aside className="adminSharedSidebar">
      <Link className="adminOpsBrand" href="/admin"><span className="adminBrandLogo"><Image src="/mueen-logo.png" alt="" width={36} height={36} /></span><strong>معين</strong></Link>
      <div className="adminOpsUser"><small>مساحتك في معين</small><strong>{profile?.full_name || "الإدارة"}</strong><span>{profile?.role === "super_admin" ? "مسؤول النظام" : "إدارة التشغيل"}</span></div>
      <nav aria-label="تنقل الإدارة">
        {sections.map((section) => <Link key={section.id} className={activeSection?.id === section.id ? "active" : ""} aria-current={activeSection?.id === section.id ? "true" : undefined} href={section.routes[0].href}>{section.label}</Link>)}
      </nav>
      <div className="adminOpsActions"><Link className="adminOpsNew" href="/request">＋ طلب جديد</Link><button className="adminOpsSignOut" type="button" disabled={signingOut} onClick={async () => { setSigningOut(true); await createClient().auth.signOut(); window.location.href = "/"; }}>{signingOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}</button></div>
    </aside>
    <div className="adminSharedContent">
      {activeSection ? <header className="adminContextTopbar">
        <span className="adminContextLabel">{activeSection.label}</span>
        <nav className="adminContextTabs" aria-label={`صفحات ${activeSection.label}`}>
          {activeSection.routes.map(route => <Link key={route.href} href={route.href} className={activeRoute?.href === route.href ? "active" : ""} aria-current={activeRoute?.href === route.href ? "page" : undefined}>{route.label}</Link>)}
        </nav>
      </header> : null}
      {children}
    </div>
    </div>
  </>;
}
