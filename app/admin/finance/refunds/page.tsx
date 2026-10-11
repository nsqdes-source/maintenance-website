import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RefundOperationsClient from "./RefundOperationsClient";
import { loadRefundOperations } from "./actions";

export const dynamic = "force-dynamic";

export default async function RefundOperationsPage() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) redirect("/admin/login");

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["admin_manager", "super_admin"].includes(profile.role)) {
    redirect("/admin");
  }

  const result = await loadRefundOperations();

  return (
    <main className="adminPage financePortal">
      <div className="container adminContainer">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">الإدارة المالية</p>
            <h1>عمليات الاسترداد</h1>
            <p>
              مراجعة واعتماد وتتبع الاستردادات دون تغيير سجل التحصيلات المؤكدة.
            </p>
          </div>

          <Link className="button secondary" href="/admin/finance">
            العودة للنظرة العامة
          </Link>
        </div>

        {result.ok ? (
          <RefundOperationsClient initialContext={result.context} />
        ) : (
          <section className="card financePanel" role="alert">
            {result.message}
          </section>
        )}
      </div>
    </main>
  );
}
