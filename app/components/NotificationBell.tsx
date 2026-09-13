"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Notification = { id: string; title: string; body: string | null; service_request_id: string; read_at: string | null; created_at: string };

export default function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    const { data } = await createClient().from("notifications")
      .select("id,title,body,service_request_id,read_at,created_at")
      .order("created_at", { ascending: false }).limit(20);
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    void createClient().from("notifications").select("id,title,body,service_request_id,read_at,created_at").order("created_at", { ascending: false }).limit(20).then(({ data }) => {
      if (active) setItems(data ?? []);
    });
    return () => { active = false; };
  }, []);
  async function markRead(id: string) {
    const { error } = await createClient().rpc("mark_notification_read", { target_notification_id: id });
    if (!error) setItems(current => current.map(item => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
  }
  const unread = items.filter(item => !item.read_at).length;
  return <div style={{ position: "relative" }}>
    <button type="button" aria-label={`الإشعارات، ${unread} غير مقروءة`} aria-expanded={open} title="الإشعارات"
      onClick={() => { setOpen(value => !value); void refresh(); }}
      style={{ width: 44, height: 44, border: "1px solid #cbd5e1", borderRadius: "50%", background: "#fff", cursor: "pointer", position: "relative" }}>
      🔔{unread ? <span style={{ position: "absolute", top: -6, left: -6, background: "#b42318", color: "#fff", borderRadius: 999, minWidth: 19, fontSize: 11 }}>{unread}</span> : null}
    </button>
    {open ? <div style={{ position: "absolute", top: "calc(100% + 10px)", left: 0, width: "min(340px, calc(100vw - 32px))", maxHeight: 400, overflowY: "auto", padding: 12, background: "#fff", border: "1px solid #dbe3ee", borderRadius: 14, boxShadow: "0 16px 42px rgba(15,23,42,.18)", zIndex: 1000 }}>
      <strong>الإشعارات</strong>
      {loading ? <p>جارٍ التحميل...</p> : !items.length ? <p>لا توجد إشعارات.</p> : items.map(item => <div key={item.id} style={{ padding: "10px 0", borderBottom: "1px solid #e2e8f0" }}>
        <strong>{item.title}</strong><p style={{ margin: "4px 0" }}>{item.body || ""}</p>
        <small>{new Date(item.created_at).toLocaleString("ar-SA")}</small>
        {!item.read_at ? <button type="button" onClick={() => markRead(item.id)} style={{ display: "block", marginTop: 5 }}>تحديد كمقروء</button> : null}
      </div>)}
    </div> : null}
  </div>;
}
