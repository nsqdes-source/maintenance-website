import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "يلزم تسجيل الدخول." },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile ||
    !["admin_manager", "super_admin"].includes(profile.role)
  ) {
    return NextResponse.json(
      { error: "غير مصرح." },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from("drive_connection")
    .delete()
    .eq("id", true);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}