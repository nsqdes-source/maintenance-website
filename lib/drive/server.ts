import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const raw = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("Drive encryption key not configured");
  const result = Buffer.from(raw, "base64");
  if (result.length !== 32) throw new Error("Drive encryption key must be 32 bytes in base64");
  return result;
}
export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map(item => item.toString("base64url")).join(".");
}
export function decryptToken(value: string) {
  const [iv, tag, body] = value.split(".").map(part => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
export async function refreshDriveToken(ciphertext: string) {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Drive OAuth credentials not configured");
  const result = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: decryptToken(ciphertext), grant_type: "refresh_token" }) });
  if (!result.ok) throw new Error(`Drive token refresh failed: ${result.status}`);
  const data = await result.json() as { access_token?: string };
  if (!data.access_token) throw new Error("Drive access token missing");
  return data.access_token;
}
export async function createDriveFolder(accessToken: string) {
  const result = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "MueenFix backups", mimeType: "application/vnd.google-apps.folder" }) });
  if (!result.ok) throw new Error(`Drive folder creation failed: ${result.status}`);
  const data = await result.json() as { id?: string };
  if (!data.id) throw new Error("Drive folder ID missing");
  return data.id;
}
export async function uploadDriveFile(accessToken: string, folderId: string, filename: string, contentType: string, bytes: Uint8Array) {
  const boundary = `mueenfix_${randomBytes(12).toString("hex")}`;
  const start = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: filename, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`);
  const end = Buffer.from(`\r\n--${boundary}--`);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body: Buffer.concat([start, Buffer.from(bytes), end]) });
  if (!response.ok) throw new Error(`Drive upload failed: ${response.status}`);
  const data = await response.json() as { id?: string };
  if (!data.id) throw new Error("Drive file ID missing");
  return data.id;
}
export function invoiceHtml(invoice: Record<string, unknown>) {
  const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>فاتورة ${esc(invoice.invoice_number)}</title><body style="font-family:Arial,sans-serif;max-width:700px;margin:40px auto"><h1>فاتورة #${esc(invoice.invoice_number)}</h1><p>${esc(invoice.business_name)} · ${esc(invoice.business_address)}</p><p>إلى ${esc(invoice.customer_name)} (${esc(invoice.customer_email)})</p><p>${esc(invoice.description)}</p><hr><p>المبلغ: ${esc(invoice.subtotal)} ر.س</p><p>الضريبة: ${esc(invoice.tax_amount)} ر.س</p><strong>الإجمالي: ${esc(invoice.total)} ر.س</strong></body></html>`;
}
