"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function HeaderAccountControl() {
  const [authenticated, setAuthenticated] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => setAuthenticated(Boolean(data.user)));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session?.user));
    });

    return () => listener.subscription.unsubscribe();
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

  if (!authenticated) {
    return <a className="button primary navCta" href="/login">تسجيل الدخول</a>;
  }

  return (
    <div ref={menuRef} style={{ position: "relative", flex: "0 0 auto" }}>
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
        <div role="menu" style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, minWidth: 210, padding: 7, border: "1px solid #e2e8f0", borderRadius: 13, background: "#fff", boxShadow: "0 16px 40px rgba(15,23,42,.12)" }}>
          <a href="/account" role="menuitem" onClick={() => setOpen(false)} style={{ display: "block", padding: "11px 12px", borderRadius: 9, fontSize: ".9rem", fontWeight: 700, textAlign: "right" }}>
            تفاصيل حساب المستخدم
          </a>
          <button type="button" role="menuitem" onClick={handleSignOut} disabled={pending} style={{ width: "100%", display: "block", padding: "11px 12px", border: 0, borderRadius: 9, background: "transparent", color: "#0f172a", fontSize: ".9rem", fontWeight: 700, textAlign: "right", cursor: pending ? "wait" : "pointer" }}>
            {pending ? "جاري تسجيل الخروج..." : "تسجيل الخروج"}
          </button>
        </div>
      )}
    </div>
  );
}
