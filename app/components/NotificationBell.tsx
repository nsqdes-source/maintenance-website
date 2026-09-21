"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Notification = { id: string; title: string; body: string | null; service_request_id: string; read_at: string | null; created_at: string };
type Role = "customer" | "technician" | "admin";

const STAGES: Record<string, { ar: string; en: string }> = {
  awaiting_assignment: { ar: "بانتظار الإسناد", en: "Awaiting assignment" },
  assigned: { ar: "تم إسناد الطلب", en: "Assigned" },
  technician_accepted: { ar: "قبل الفني الطلب", en: "Technician accepted" },
  in_progress: { ar: "قيد التنفيذ", en: "In progress" },
  awaiting_completion_review: { ar: "بانتظار مراجعة الإدارة", en: "Awaiting admin review" },
  needs_followup: { ar: "بحاجة إلى قطع ومواد أو تعديل", en: "Parts or follow-up needed" },
  reschedule_requested: { ar: "طلب الفني إعادة جدولة الموعد", en: "Technician requested rescheduling" },
  unable_to_complete: { ar: "تعذر على الفني إتمام التنفيذ", en: "Technician could not complete the work" },
  awaiting_admin_quote: { ar: "بانتظار عرض الإصلاح", en: "Awaiting repair quote" },
  awaiting_customer_approval: { ar: "بانتظار موافقة العميل", en: "Awaiting customer approval" },
  quote_approved: { ar: "وافق العميل على العرض", en: "Quote approved" },
  completed: { ar: "تم التنفيذ", en: "Completed" },
  customer_rejected: { ar: "رفض العميل الإصلاح", en: "Customer declined" },
  customer_cancelled: { ar: "ألغى العميل الطلب", en: "Customer cancelled" },
  cancelled: { ar: "ملغي", en: "Cancelled" },
};

export default function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [role, setRole] = useState<Role>("customer");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locale, setLocale] = useState<"ar" | "en">("ar");

  async function refresh() {
    setLoading(true);
    const supabase = createClient();
    const [{ data }, { data: auth }] = await Promise.all([
      supabase.from("notifications").select("id,title,body,service_request_id,read_at,created_at").order("created_at", { ascending: false }).limit(20),
      supabase.auth.getUser(),
    ]);
    // Keep the newest notification for an identical request/stage pair. Older events remain in the request timeline.
    const unique = (data ?? []).filter((item, index, rows) => rows.findIndex(candidate => candidate.service_request_id === item.service_request_id && candidate.body === item.body) === index);
    setItems(unique);
    if (auth.user) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      setRole(profile?.role === "technician" ? "technician" : ["maintenance_manager", "admin_manager", "super_admin"].includes(profile?.role ?? "") ? "admin" : "customer");
    }
    setLocale(document.documentElement.lang === "en" ? "en" : "ar");
    setLoading(false);
  }

  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, []);

  async function openRequest(item: Notification) {
    if (!item.read_at) {
      const { error } = await createClient().rpc("mark_notification_read", { target_notification_id: item.id });
      if (!error) setItems(current => current.map(row => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row));
    }
    setOpen(false);
    const id = encodeURIComponent(item.service_request_id);
    router.push(role === "admin" ? `/admin/requests/${id}` : role === "technician" ? `/technician#request-${id}` : `/account#request-${id}`);
  }

  async function markAllRead() {
    const { error } = await createClient().rpc("mark_all_notifications_read");
    if (!error) setItems(current => current.map(item => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
  }

  const unread = items.filter(item => !item.read_at).length;
  return <div className="notificationMenu">
    <button type="button" className="notificationTrigger" aria-label={locale === "ar" ? `الإشعارات، ${unread} غير مقروءة` : `Notifications, ${unread} unread`} aria-expanded={open} title={locale === "ar" ? "الإشعارات" : "Notifications"}
      onClick={() => { setOpen(value => !value); void refresh(); }}>
      🔔{unread ? <span className="notificationCount">{unread}</span> : null}
    </button>
    {open ? <div className="notificationPanel">
      <div className="notificationPanelHeader"><strong>{locale === "ar" ? "الإشعارات" : "Notifications"}</strong>{unread ? <button type="button" onClick={() => void markAllRead()}>{locale === "ar" ? "تعيين الكل كمقروء" : "Mark all as read"}</button> : null}</div>
      {loading ? <p>{locale === "ar" ? "جارٍ التحميل..." : "Loading..."}</p> : !items.length ? <p>{locale === "ar" ? "لا توجد إشعارات." : "No notifications."}</p> : items.map(item => {
        const stage = item.body && STAGES[item.body];
        return <button key={item.id} type="button" className={`notificationItem ${item.read_at ? "" : "unread"}`} onClick={() => void openRequest(item)}>
          <strong>{stage ? (locale === "ar" ? `طلب الصيانة: ${stage.ar}` : `Service request: ${stage.en}`) : item.title}</strong>
          <span>{stage ? stage[locale] : item.body || ""}</span>
          <small>{new Date(item.created_at).toLocaleString(locale === "ar" ? "ar-SA" : "en-US")}</small>
        </button>;
      })}
    </div> : null}
  </div>;
}
