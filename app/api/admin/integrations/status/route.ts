import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["admin_manager", "super_admin"].includes(profile.role)) return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  return NextResponse.json({
    invoiceEmailConfigured: Boolean(process.env.RESEND_API_KEY),
    driveOAuthConfigured: Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REDIRECT_URI && process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY),
  });
}
