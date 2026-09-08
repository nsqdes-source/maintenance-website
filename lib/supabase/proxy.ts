import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type SupabaseCookie = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

type SupabaseHeaders = Record<string, string>;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll(): Array<{ name: string; value: string }> {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: SupabaseCookie[],
          headers: SupabaseHeaders = {}
        ) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            if (options) {
              supabaseResponse.cookies.set(name, value, options);
            } else {
              supabaseResponse.cookies.set(name, value);
            }
          });

          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value);
          });
        },
      },
    }
  );

  await supabase.auth.getUser();

  return supabaseResponse;
}
