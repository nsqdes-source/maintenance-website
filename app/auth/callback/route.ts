import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getSafeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/account";
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

  return NextResponse.redirect(new URL(next, request.nextUrl.origin));
}
