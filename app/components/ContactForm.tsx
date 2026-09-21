"use client";

import { type FormEvent, useState } from "react";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, subject, message, website }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setStatus(result.error || "تعذر إرسال الرسالة. حاول مرة أخرى."); return; }
      setStatus("وصلت رسالتك إلى فريق معين. سنتواصل معك قريبًا.");
      setMessage("");
      setSubject("");
    } catch {
      setStatus("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="contactForm" onSubmit={submit}>
    <label>الاسم<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>الجوال<input maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
    <label>البريد الإلكتروني<input type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>الموضوع<input maxLength={180} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
    <label>رسالتك<textarea required maxLength={4000} rows={4} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
    <label className="contactHoneypot" aria-hidden="true">الموقع الإلكتروني<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
    <button className="button primary" disabled={busy}>{busy ? "جارٍ الإرسال..." : "إرسال رسالة"}</button>
    {status ? <p role="status">{status}</p> : null}
  </form>;
}
