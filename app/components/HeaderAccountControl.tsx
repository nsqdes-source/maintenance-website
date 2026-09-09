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
        setAuthenticated(true);
        setEmail(user.email ?? "");
        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name, phone, role")
          .eq("id", user.id)
          .maybeSingle();
        if (mounted) setProfile(profileData);
        setReady(true);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!mounted) return;

      if (userData.user) {
        setAuthenticated(true);
        setEmail(userData.user.email ?? "");
        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name, phone, role")
          .eq("id", userData.user.id)
          .maybeSingle();
        if (mounted) setProfile(profileData);
      } else {
        setAuthenticated(false);
        setProfile(null);
        setEmail("");
      }
      setReady(true);
    }

    loadAuthState();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setAuthenticated(Boolean(session?.user));
      setEmail(session?.user?.email ?? "");
      if (!session?.user) setProfile(null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  async function handleSignOut() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (!ready || !authenticated) {
    return <a className="button primary navCta" href="/login">تسجيل الدخول</a>;
  }

  return (
    <div ref={menuRef} style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", flex: "0 0 auto" }}>
      {pathname !== "/" ? (
        <a className="button secondary" href="/" aria-label="العودة إلى الصفحة الرئيسية">الرئيسية</a>
      ) : null}

      <button
        type="button"
        aria-label="حساب المستخدم"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{ width: 44, height: 44, display: "grid", placeItems: "center", padding: 0, border: "1px solid #cbd5e1", borderRadius: "50%", background: "#fff", color: "#0f172a", cursor: "pointer" }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 22, height: 22, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c.7-3.3 3.2-5 7-5s6.3 1.7 7 5" />
        </svg>
      </button>

      {open && (
        <div role="menu" style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, minWidth: 250, padding: 12, border: "1px solid #e2e8f0", borderRadius: 13, background: "#fff", boxShadow: "0 16px 40px rgba(15,23,42,.12)" }}>
          <div style={{ padding: "4px 5px 10px", borderBottom: "1px solid #e2e8f0" }}>
            <strong style={{ display: "block", marginBottom: 8, fontSize: ".95rem" }}>بيانات الحساب</strong>
            <div style={{ display: "grid", gap: 5, color: "#475569", fontSize: ".84rem" }}>
              <span>الاسم: {profile?.full_name || "—"}</span>
              <span>البريد الإلكتروني: {email || "—"}</span>
              <span>رقم الجوال: {profile?.phone || "—"}</span>
              <span>نوع الحساب: {ROLE_LABELS[profile?.role ?? ""] ?? profile?.role ?? "—"}</span>
            </div>
          </div>
          <button type="button" role="menuitem" onClick={handleSignOut} disabled={pending} style={{ width: "100%", display: "block", marginTop: 8, padding: "11px 12px", border: 0, borderRadius: 9, background: "transparent", color: "#0f172a", fontSize: ".9rem", fontWeight: 700, textAlign: "right", cursor: pending ? "wait" : "pointer" }}>
            {pending ? "جاري تسجيل الخروج..." : "تسجيل الخروج"}
          </button>
        </div>
      )}
    </div>
  );
}
