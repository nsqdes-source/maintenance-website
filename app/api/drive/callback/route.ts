import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createDriveFolder, encryptToken } from "@/lib/drive/server";

export async function GET(request: NextRequest) {
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const toFinance = (status: string) => NextResponse.redirect(new URL(`/admin/finance?drive=${encodeURIComponent(status)}`, request.url));
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const expected = (await cookies()).get("drive_oauth_state")?.value;
  if (!state || !expected || state !== expected || !code || !redirectUri || !clientId || !clientSecret) return toFinance("failed");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return toFinance("login-required");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin_manager", "super_admin"].includes(profile.role)) return toFinance("forbidden");
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
    if (!response.ok) throw new Error(`Drive token exchange failed: ${response.status}`);
    const token = await response.json() as { access_token?: string; refresh_token?: string };
    if (!token.access_token || !token.refresh_token) throw new Error("Drive offline token missing");
    const folderId = await createDriveFolder(token.access_token);
    const { error } = await supabase.from("drive_connection").upsert({ id: true, refresh_token_ciphertext: encryptToken(token.refresh_token), folder_id: folderId, connected_at: new Date().toISOString() });
    if (error) throw error;
    const result = toFinance("connected");
    result.cookies.delete("drive_oauth_state");
    return result;
  } catch (error) { console.error("Drive OAuth callback error:", error); return toFinance("failed"); }
}
