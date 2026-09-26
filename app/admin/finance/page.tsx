import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FinanceDashboard from "./FinanceDashboard";

export const dynamic = "force-dynamic";

const roles = new Set(["admin_manager", "super_admin"]);

export default async function FinancePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !roles.has(profile.role)) {
    redirect("/admin");
  }

  const [{ data: invoices }, { data: summary }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id,invoice_number,customer_name,customer_email,total,status,created_at,issued_at"
      )
      .order("created_at", { ascending: false })
      .limit(5),

    supabase.rpc("finance_get_summary").single(),
  ]);

  return (
    <main className="adminPage financePortal">
      <div className="container adminContainer">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">الإدارة المالية</p>
            <h1>المالية والفواتير</h1>
          </div>

          <Link className="button secondary" href="/admin">
            العودة للإدارة
          </Link>
        </div>

        <FinanceDashboard
          invoices={invoices ?? []}
          summary={
            (summary as {
              issued_total: number;
              collected_total: number;
              outstanding_total: number;
            } | null) ?? {
              issued_total: 0,
              collected_total: 0,
              outstanding_total: 0,
            }
          }
        />
      </div>
    </main>
  );
}