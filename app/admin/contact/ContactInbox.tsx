"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type ContactMessage = { id: string; name: string; phone: string | null; email: string | null; subject: string | null; message: string; status: string; created_at: string };
const labels: Record<string, string> = { new: "جديدة", read: "قيد المتابعة", resolved: "مغلقة" };

export default function ContactInbox({ messages }: { messages: ContactMessage[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function updateStatus(id: string, status: string) {
    setBusyId(id);
    setError("");
    const { error: updateError } = await createClient().rpc("admin_update_contact_message_status", { target_message_id: id, new_status: status });
    setBusyId("");
    if (updateError) { setError("تعذر تحديث حالة الرسالة."); return; }
    router.refresh();
  }

  if (!messages.length) return <div className="emptyState"><h2>لا توجد رسائل</h2><p>ستظهر رسائل نموذج التواصل هنا.</p></div>;
  return <>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="contactInbox">{messages.map((message) => <article className={`card contactInboxItem status-${message.status}`} key={message.id}>
      <div className="contactInboxHead"><div><span className="statusBadge">{labels[message.status] ?? message.status}</span><h2>{message.subject || "استفسار عام"}</h2></div><time>{new Date(message.created_at).toLocaleString("ar-SA")}</time></div>
      <p className="contactSender"><strong>{message.name}</strong>{message.phone ? <a href={`tel:${message.phone}`}>{message.phone}</a> : null}{message.email ? <a href={`mailto:${message.email}`}>{message.email}</a> : null}</p>
      <p className="contactMessageBody">{message.message}</p>
      <div className="filterActions">{message.status === "new" ? <button className="button secondary compactButton" disabled={busyId === message.id} onClick={() => updateStatus(message.id, "read")}>بدء المتابعة</button> : null}{message.status !== "resolved" ? <button className="button primary compactButton" disabled={busyId === message.id} onClick={() => updateStatus(message.id, "resolved")}>إغلاق الرسالة</button> : <button className="button secondary compactButton" disabled={busyId === message.id} onClick={() => updateStatus(message.id, "read")}>إعادة فتحها</button>}</div>
    </article>)}</div>
  </>;
}
