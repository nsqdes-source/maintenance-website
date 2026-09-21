import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);

export async function POST(request: Request) {
  let payload: { name?: string; phone?: string; email?: string; subject?: string; message?: string; website?: string };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "بيانات الرسالة غير صالحة." }, { status: 400 }); }
  if (payload.website) return NextResponse.json({ ok: true }, { status: 201 });
  const name = payload.name?.trim() ?? "";
  const message = payload.message?.trim() ?? "";
  if (!name || !message || name.length > 120 || message.length > 4000 || (payload.email?.length ?? 0) > 254 || (payload.phone?.length ?? 0) > 40 || (payload.subject?.length ?? 0) > 180) {
    return NextResponse.json({ error: "راجع الحقول المطلوبة وأطوال النصوص." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: messageId, error } = await supabase.rpc("submit_contact_message", {
    sender_name: name,
    sender_phone: payload.phone?.trim() || null,
    sender_email: payload.email?.trim() || null,
    message_subject: payload.subject?.trim() || null,
    message_body: message,
  });
  if (error || !messageId) {
    console.error("Contact message insert failed", error);
    return NextResponse.json({ error: "تعذر حفظ الرسالة حاليًا." }, { status: 500 });
  }

  const { data: footer } = await supabase.from("site_footer_content").select("email,company_name").eq("id", true).maybeSingle();
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = footer?.email?.trim();
  if (!apiKey || !recipient) return NextResponse.json({ ok: true, emailDelivered: false }, { status: 201 });

  const html = `<html lang="ar" dir="rtl"><body style="font-family:Arial,sans-serif;max-width:650px;margin:auto;color:#172238"><h1>رسالة جديدة من موقع معين</h1><p><strong>الاسم:</strong> ${escapeHtml(name)}</p><p><strong>الجوال:</strong> ${escapeHtml(payload.phone || "—")}</p><p><strong>البريد:</strong> ${escapeHtml(payload.email || "—")}</p><p><strong>الموضوع:</strong> ${escapeHtml(payload.subject || "استفسار عام")}</p><hr><p style="white-space:pre-wrap">${escapeHtml(message)}</p></body></html>`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `contact-${messageId}` },
      body: JSON.stringify({
        from: process.env.RESEND_CONTACT_FROM || "معين <contact@mail.mueenfix.com>",
        to: [recipient],
        reply_to: payload.email?.trim() || undefined,
        subject: `رسالة موقع: ${payload.subject?.trim() || "استفسار جديد"}`,
        html,
      }),
    });
    if (!response.ok) {
      console.error("Contact email provider error", response.status, await response.text());
      return NextResponse.json({ ok: true, emailDelivered: false }, { status: 201 });
    }
    return NextResponse.json({ ok: true, emailDelivered: true }, { status: 201 });
  } catch (emailError) {
    console.error("Contact email delivery failed", emailError);
    return NextResponse.json({ ok: true, emailDelivered: false }, { status: 201 });
  }
}
