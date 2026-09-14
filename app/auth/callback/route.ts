import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getSafeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = getSafeNext(request.nextUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=confirmation_failed", request.nextUrl.origin)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Email confirmation callback failed", {
      name: error.name,
      message: error.message,
      status: error.status,
      code: error.code,
    });

    return NextResponse.redirect(
      new URL("/login?error=confirmation_failed", request.nextUrl.origin)
    );
  }

  if (next) {
    const response = NextResponse.redirect(new URL(next, request.nextUrl.origin));

    if (next === "/update-password") {
      response.cookies.set("password_recovery", "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 15 * 60,
      });
    }

    return response;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=confirmation_failed", request.nextUrl.origin));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const destination = profile?.role === "technician"
    ? "/technician"
    : ["maintenance_manager", "admin_manager", "super_admin"].includes(profile?.role ?? "")
      ? "/admin"
      : "/account";

  return NextResponse.redirect(new URL(destination, request.nextUrl.origin));
}
