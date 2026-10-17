"use server";

import { createClient } from "@/lib/supabase/server";
import type { RefundOperations } from "./types";

const financeRoles = new Set(["admin_manager", "super_admin"]);

async function requireFinanceUser() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    return { ok: false as const, message: "يرجى تسجيل الدخول." };
  }

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !financeRoles.has(profile.role)) {
    return { ok: false as const, message: "غير مصرح لك." };
  }

  return { ok: true as const, db };
}

export async function loadRefundOperations(offset = 0) {
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) {
    return { ok: false as const, message: "طلب الصفحة غير صالح." };
  }

  try {
    const auth = await requireFinanceUser();
    if (!auth.ok) return auth;

    const { data, error } = await auth.db.rpc("finance_get_refund_operations", {
      p_limit: 50,
      p_offset: offset,
    });

    if (error) {
      return { ok: false as const, message: "تعذر تحميل عمليات الاسترداد." };
    }

    return {
      ok: true as const,
      context: data as RefundOperations,
    };
  } catch {
    return { ok: false as const, message: "تعذر تحميل عمليات الاسترداد." };
  }
}

export async function decideRefund(
  refundId: string,
  decision: "approved" | "rejected" | "cancelled",
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      refundId,
    ) ||
    !["approved", "rejected", "cancelled"].includes(decision)
  ) {
    return { ok: false as const, message: "بيانات القرار غير صالحة." };
  }

  try {
    const auth = await requireFinanceUser();
    if (!auth.ok) return auth;

    const { data: settings } = await auth.db
      .from("business_finance_settings")
      .select("payment_domain_enabled")
      .eq("id", true)
      .maybeSingle();

    if (!settings?.payment_domain_enabled) {
      return {
        ok: false as const,
        message: "مسار الدفع غير مفعّل؛ الصفحة في وضع المراجعة فقط.",
      };
    }

    const { error } = await auth.db.rpc("finance_decide_refund", {
      p_refund_id: refundId,
      p_decision: decision,
    });

    if (error) {
      const messages: Record<string, string> = {
        refund_not_found: "طلب الاسترداد غير موجود.",
        refund_decision_not_allowed_from_current_status:
          "لا يمكن تطبيق هذا القرار على الحالة الحالية.",
        refund_cancel_not_allowed_from_current_status:
          "لا يمكن إلغاء الاسترداد في حالته الحالية.",
        invalid_refund_decision: "قرار الاسترداد غير صالح.",
        insufficient_privilege: "غير مصرح لك.",
      };

      return {
        ok: false as const,
        message: messages[error.message] ?? "تعذر تنفيذ قرار الاسترداد.",
      };
    }

    return { ok: true as const, message: "تم تحديث حالة الاسترداد." };
  } catch {
    return { ok: false as const, message: "تعذر تنفيذ قرار الاسترداد." };
  }
}
