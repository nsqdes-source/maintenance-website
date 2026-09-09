"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  full_name: string | null;
  phone: string | null;
  role: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  customer: "عميل",
  technician: "فني",
  maintenance_manager: "مدير صيانة",
  admin_manager: "مدير إدارة",
  super_admin: "مدير النظام",
};

export default function HeaderAccountControl() {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    async function loadAuthState() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!mounted) return;
      if (user) {
        setAuthenticated(true); setEmail(user.email ?? "");
        const { data: profileData } = await supabase.from("profiles").select("full_name, phone, role").eq("id", user.id).maybeSingle();
        if (mounted) setProfile(profileData); setReady(true); return;
      }
      const { data: userData } = await supabase.auth.getUser();
      if (!mounted) return;
      if (userData.user) {
        setAuthenticated(true); setEmail(userData.user.email ?? "");
        const { data: profileData } = await supabase.from("profiles").select("full_name, phone, role").eq("id", userData.user.id).maybeSingle();
        if (mounted) setProfile(profileData);
      } else { setAuthenticated(false); setProfile(null); setEmail(""); }
      setReady(true);
    }
    loadAuthState();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setAuthenticated(Boolean(session?.user)); setEmail(session?.user?.email ?? ""); if (!session?.user) setProfile(null);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  async function handleSignOut() {
    setPending(true); const supabase = createClient(); await supabase.auth.signOut(); window.location.href = "/";
  }

  if (!ready || !authenticated) return <a className="button primary navCta" href="/login">تسجيل الدخول</a>;

  const accountPath = profile?.role === "technician" ? "/technician" : profile?.role === "maintenance_manager" || profile?.role === "admin_manager" || profile?.role === "super_admin" ? "/admin" : "/account";
  const accountLabel = profile?.role === "technician" ? "حسابي" : profile?.role === "maintenance_manager" || profile?.role === "admin_manager" || profile?.role === "super_admin" ? "الإدارة" : "حسابي";

  return (
    <div ref={menuRef} style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", flex: "0 0 auto" }}>
      {pathname !== "/" ? <a href="/" aria-label="العودة إلى الصفحة الرئيسية" title="العودة إلى الرئيسية" style={{ width: 44, height: 44, display: "grid", placeItems: "center", padding: 0, border: "1px solid #cbd5e1", borderRadius: "50%", background: "#fff", color: "#0f172a", textDecoration: "none", flex: "0 0 auto" }}><svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 21, height: 21, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}><path d="M3.5 10.5 12 3.8l8.5 6.7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M9.5 20v-6h5v6" /></svg></a> : null}
      <button type="button" aria-label="حساب المستخدم" aria-expanded={open} onClick={() => setOpen((value) => !value)} style={{ width: 44, height: 44, display: "grid", placeItems: "center", padding: 0, border: "1px solid #cbd5e1", borderRadius: "50%", background: "#fff", color: "#0f172a", cursor: "pointer", flex: "0 0 auto" }}><svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 22, height: 22, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-3.3 3.2-5 7-5s6.3 1.7 7 5" /></svg></button>
      {open && <div role="menu" style={{ position: "absolute", top: "calc(100% + 10px)", left: 0, width: "min(256px, calc(100vw - 32px))", padding: 12, border: "1px solid #dbe3ee", borderRadius: 14, background: "#fff", boxShadow: "0 16px 42px rgba(15,23,42,.18)", zIndex: 1000, direction: "rtl" }}>
        <div style={{ padding: "3px 5px 10px", borderBottom: "1px solid #e2e8f0" }}><div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}><strong style={{ fontSize: ".95rem", color: "#0f172a" }}>بيانات الحساب</strong><a href="/account/edit" aria-label="تعديل المعلومات" title="تعديل المعلومات" style={{ width: 24, height: 24, display: "grid", placeItems: "center", padding: 0, border: 0, borderRadius: 6, background: "transparent", color: "#475569", textDecoration: "none" }}><svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg></a></div><div style={{ display: "grid", gap: 6, color: "#475569", fontSize: ".82rem", lineHeight: 1.55 }}><span>الاسم: {profile?.full_name || "—"}</span><span style={{ overflowWrap: "anywhere" }}>البريد الإلكتروني: {email || "—"}</span><span>رقم الجوال: {profile?.phone || "—"}</span><span>نوع الحساب: {ROLE_LABELS[profile?.role ?? ""] ?? profile?.role ?? "—"}</span></div></div>
        <a href={accountPath} role="menuitem" style={{ width: "100%", display: "block", marginTop: 8, padding: "9px 10px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", color: "#0f172a", fontSize: ".82rem", fontWeight: 700, textAlign: "right", textDecoration: "none" }}>{accountLabel}</a>
        <button type="button" role="menuitem" onClick={handleSignOut} disabled={pending} style={{ width: "100%", display: "block", marginTop: 8, padding: "9px 10px", border: 0, borderRadius: 8, background: "#f8fafc", color: "#0f172a", fontSize: ".82rem", fontWeight: 700, textAlign: "right", cursor: pending ? "wait" : "pointer" }}>{pending ? "جاري تسجيل الخروج..." : "تسجيل الخروج"}</button>
      </div>}
    </div>
  );
}
