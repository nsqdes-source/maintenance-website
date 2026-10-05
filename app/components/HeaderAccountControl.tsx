"use client";
import Link from "next/link";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NotificationBell from "./NotificationBell";
import AvatarImage from "./AvatarImage";

type Profile = {
  full_name: string | null;
  phone: string | null;
  role: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  customer: "عميل",
  technician: "فني",
  maintenance_manager: "مشرف",
  admin_manager: "مشرف",
  super_admin: "مشرف",
};

const ROLE_COLORS: Record<string, { background: string; color: string; border: string }> = {
  customer: { background: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
  technician: { background: "#ecfdf5", color: "#15803d", border: "#bbf7d0" },
  maintenance_manager: { background: "#fff7ed", color: "#ea580c", border: "#fed7aa" },
  admin_manager: { background: "#fff7ed", color: "#ea580c", border: "#fed7aa" },
  super_admin: { background: "#fff7ed", color: "#ea580c", border: "#fed7aa" },
};

export default function HeaderAccountControl({ ctaText = "تسجيل الدخول" }: { ctaText?: string }) {
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

        if (mounted) {
          setProfile(profileData);
          setReady(true);
        }

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
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
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

  if (pathname === "/update-password") return null;

  if (!ready || !authenticated) {
    return (
      <Link className="button primary navCta" href="/login">
        {ctaText}
      </Link>
    );
  }

  const role = profile?.role ?? "";
  const isTechnician = role === "technician";
  const isAdmin =
    role === "maintenance_manager" ||
    role === "admin_manager" ||
    role === "super_admin";

  const roleLabel = ROLE_LABELS[role] ?? role ?? "—";
  const roleColors =
    ROLE_COLORS[role] ?? {
      background: "#f8fafc",
      color: "#475569",
      border: "#e2e8f0",
    };

  return (
    <div
      ref={menuRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        position: "relative",
        flex: "0 0 auto",
      }}
    >
      {pathname !== "/" ? (
        <Link
          href="/"
          aria-label="العودة إلى الصفحة الرئيسية"
          title="العودة إلى الرئيسية"
          style={{
            width: 44,
            height: 44,
            display: "grid",
            placeItems: "center",
            padding: 0,
            border: "1px solid #cbd5e1",
            borderRadius: "50%",
            background: "#fff",
            color: "#0f172a",
            textDecoration: "none",
            flex: "0 0 auto",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            style={{
              width: 21,
              height: 21,
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 1.8,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            }}
          >
            <path d="M3.5 10.5 12 3.8l8.5 6.7" />
            <path d="M5.5 9.5V20h13V9.5" />
            <path d="M9.5 20v-6h5v6" />
          </svg>
        </Link>
      ) : null}

      <NotificationBell />

      <button
        type="button"
        aria-label="حساب المستخدم"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{
          width: 44,
          height: 44,
          display: "grid",
          placeItems: "center",
          padding: 0,
          border: "1px solid #cbd5e1",
          borderRadius: "50%",
          background: "#fff",
          color: "#0f172a",
          cursor: "pointer",
          flex: "0 0 auto",
        }}
      >
        <AvatarImage />
      </button>

      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            left: 0,
            width: "min(256px, calc(100vw - 32px))",
            padding: 12,
            border: "1px solid #dbe3ee",
            borderRadius: 14,
            background: "#fff",
            boxShadow: "0 16px 42px rgba(15,23,42,.18)",
            zIndex: 1000,
            direction: "rtl",
          }}
        >
          <div
            style={{
              padding: "6px 8px 11px",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              background: "#f8fafc",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    flexWrap: "wrap",
                  }}
                >
                  <strong
                    style={{
                      fontSize: ".95rem",
                      color: "#0f172a",
                      lineHeight: 1.5,
                    }}
                  >
                    {profile?.full_name || "—"}
                  </strong>

                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: roleColors.background,
                      color: roleColors.color,
                      border: `1px solid ${roleColors.border}`,
                      fontSize: ".72rem",
                      fontWeight: 800,
                      lineHeight: 1.35,
                    }}
                  >
                    {roleLabel}
                  </span>
                </div>

                <span
                  style={{
                    display: "block",
                    marginTop: 3,
                    color: "#64748b",
                    fontSize: ".78rem",
                    lineHeight: 1.45,
                    overflowWrap: "anywhere",
                  }}
                >
                  {email || "—"}
                </span>
              </div>

              <Link
                href="/account/edit"
                aria-label="تعديل المعلومات"
                title="تعديل المعلومات"
                onClick={() => setOpen(false)}
                style={{
                  width: 28,
                  height: 28,
                  display: "grid",
                  placeItems: "center",
                  padding: 0,
                  border: "1px solid #e2e8f0",
                  borderRadius: "50%",
                  background: "#fff",
                  color: "#475569",
                  textDecoration: "none",
                  flex: "0 0 auto",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  style={{
                    width: 15,
                    height: 15,
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: 1.8,
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                  }}
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
                </svg>
              </Link>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isTechnician || isAdmin ? "1fr 1fr" : "1fr",
              gap: 8,
              marginTop: 8,
            }}
          >
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              style={{
                width: "100%",
                display: "block",
                padding: "9px 10px",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                background: "#f8fafc",
                color: "#0f172a",
                fontSize: ".82rem",
                fontWeight: 700,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              حسابي
            </Link>

            {isTechnician ? (
              <Link
                href="/technician"
                role="menuitem"
                onClick={() => setOpen(false)}
                style={{
                  width: "100%",
                  display: "block",
                  padding: "9px 10px",
                  border: "1px solid #d1fae5",
                  borderRadius: 8,
                  background: "#ecfdf5",
                  color: "#166534",
                  fontSize: ".82rem",
                  fontWeight: 800,
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                لوحة الفني
              </Link>
            ) : null}

            {isAdmin ? (
              <Link
                href="/admin"
                role="menuitem"
                onClick={() => setOpen(false)}
                style={{
                  width: "100%",
                  display: "block",
                  padding: "9px 10px",
                  border: "1px solid #d1fae5",
                  borderRadius: 8,
                  background: "#ecfdf5",
                  color: "#166534",
                  fontSize: ".82rem",
                  fontWeight: 800,
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                لوحة الإدارة
              </Link>
            ) : null}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={pending}
            style={{
              width: "100%",
              display: "block",
              marginTop: 8,
              padding: "9px 10px",
              border: "1px solid #fecdd3",
              borderRadius: 8,
              background: "#fff1f2",
              color: "#9f1239",
              fontSize: ".82rem",
              fontWeight: 800,
              textAlign: "center",
              cursor: pending ? "wait" : "pointer",
            }}
          >
            {pending ? "جاري تسجيل الخروج..." : "تسجيل الخروج"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
