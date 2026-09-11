import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const phonePattern = /^0\d{9}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegistrationPayload = {
  fullName?: unknown;
  phone?: unknown;
  email?: unknown;
  password?: unknown;
};

function getSiteUrl(request: NextRequest) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/$/, "");
  }

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) {
    const normalizedHost = productionHost
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    return `https://${normalizedHost}`;
  }

  return request.nextUrl.origin;
}

function getPublicSignupError(status?: number, code?: string) {
  if (status === 429 || code === "over_email_send_rate_limit") {
    return "تم تجاوز الحد المؤقت لإرسال رسائل التأكيد. انتظر قليلًا ثم حاول مرة أخرى.";
  }

  if (code === "email_address_invalid") {
    return "تعذر استخدام هذا البريد الإلكتروني. تحقق منه ثم حاول مرة أخرى.";
  }

  return "تعذر إنشاء الحساب حاليًا. تحقق من البيانات وحاول مرة أخرى.";
}

export async function POST(request: NextRequest) {
  let payload: RegistrationPayload;

  try {
    payload = (await request.json()) as RegistrationPayload;
  } catch {
    return NextResponse.json(
      { error: "بيانات التسجيل غير صالحة." },
      { status: 400 }
    );
  }

  const fullName =
    typeof payload.fullName === "string" ? payload.fullName.trim() : "";
  const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";
  const email =
    typeof payload.email === "string"
      ? payload.email.trim().toLowerCase()
      : "";
  const password =
    typeof payload.password === "string" ? payload.password : "";

  if (!fullName) {
    return NextResponse.json({ error: "يرجى إدخال الاسم." }, { status: 400 });
  }

  if (!phonePattern.test(phone)) {
    return NextResponse.json(
      { error: "رقم الجوال يجب أن يتكون من 10 أرقام ويبدأ بـ 0." },
      { status: 400 }
    );
  }

  if (!emailPattern.test(email)) {
    return NextResponse.json(
      { error: "يرجى إدخال بريد إلكتروني صحيح." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "كلمة المرور يجب ألا تقل عن 8 أحرف." },
      { status: 400 }
    );
  }

  const callbackUrl = new URL("/account", getSiteUrl(request));

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callbackUrl.toString(),
      data: {
        full_name: fullName,
        phone,
      },
    },
  });

  if (error) {
    console.error("Customer registration failed", {
      name: error.name,
      message: error.message,
      status: error.status,
      code: error.code,
    });

    return NextResponse.json(
      { error: getPublicSignupError(error.status, error.code) },
      { status: error.status === 429 ? 429 : 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
