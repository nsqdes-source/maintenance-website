import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { invoiceHtml, refreshDriveToken, uploadDriveFile } from "@/lib/drive/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin_manager", "super_admin"].includes(profile.role)) return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  let payload: { type?: string; id?: string };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "طلب غير صحيح." }, { status: 400 }); }
  if (!payload.id || !/^[0-9a-f-]{36}$/i.test(payload.id) || !["invoice", "request_image"].includes(payload.type || "")) return NextResponse.json({ error: "طلب غير صحيح." }, { status: 400 });
  const type = payload.type as "invoice" | "request_image";
  const { data: existing } = await supabase.from("drive_syncs").select("drive_file_id").eq("source_type", type).eq("source_id", payload.id).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, alreadySynced: true });
  const { data: connection } = await supabase.from("drive_connection").select("refresh_token_ciphertext,folder_id").eq("id", true).maybeSingle();
  if (!connection) return NextResponse.json({ error: "اربط Google Drive أولًا من صفحة المالية." }, { status: 409 });
  try {
    let filename: string, contentType: string, bytes: Uint8Array;
    if (type === "invoice") {
      const { data: invoice } = await supabase.from("invoices").select("invoice_number,customer_name,customer_email,business_name,business_address,description,subtotal,tax_amount,total,status").eq("id", payload.id).single();
      if (!invoice || invoice.status !== "issued") return NextResponse.json({ error: "يجب إصدار الفاتورة قبل مزامنتها." }, { status: 409 });
      filename = `invoice-${invoice.invoice_number}.html`;
      contentType = "text/html";
      bytes = new TextEncoder().encode(invoiceHtml(invoice));
    } else {
      const { data: attachment } = await supabase.from("service_request_attachments").select("storage_path,content_type").eq("id", payload.id).single();
      if (!attachment) return NextResponse.json({ error: "الصورة غير موجودة." }, { status: 404 });
      const { data: file, error } = await supabase.storage.from("request-images").download(attachment.storage_path);
      if (error || !file) throw error || new Error("Attachment download failed");
      filename = `request-${attachment.storage_path.split("/")[0]}-${payload.id}.${attachment.content_type.split("/")[1] === "jpeg" ? "jpg" : attachment.content_type.split("/")[1]}`;
      contentType = attachment.content_type;
      bytes = new Uint8Array(await file.arrayBuffer());
    }
    const accessToken = await refreshDriveToken(connection.refresh_token_ciphertext);
    const driveFileId = await uploadDriveFile(accessToken, connection.folder_id, filename, contentType, bytes);
    const { error: recordError } = await supabase.from("drive_syncs").insert({ source_type: type, source_id: payload.id, drive_file_id: driveFileId });
    if (recordError) throw recordError;
    return NextResponse.json({ ok: true });
  } catch (error) { console.error("Drive sync error:", error); return NextResponse.json({ error: "تعذرت مزامنة الملف مع Drive. تحقق من الاتصال وحاول مجددًا." }, { status: 502 }); }
}
