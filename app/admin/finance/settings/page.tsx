import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FinanceSettingsClient from "./FinanceSettingsClient";

export const dynamic = "force-dynamic";

const roles = new Set(["admin_manager", "super_admin"]);

type Settings = {
  legal_name: string;
  address: string;
  contact_email: string;
  tax_number: string;
  tax_rate: number;
  vat_registered: boolean | null;
};

export default async function FinanceSettingsPage() {
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

  const [
    { data: settings },
    { data: driveConnection },
  ] = await Promise.all([
    supabase
      .from("business_finance_settings")
      .select(
        "legal_name,address,contact_email,tax_number,tax_rate,vat_registered"
      )
      .eq("id", true)
      .single(),

    supabase
      .from("drive_connection")
      .select("id")
      .eq("id", true)
      .maybeSingle(),
  ]);

  const initialSettings: Settings = settings ?? {
    legal_name: "مؤسسة أمان للمقاولات",
    address: "",
    contact_email: "",
    tax_number: "",
    tax_rate: 0,
    vat_registered: null,
  };

  return (
    <main className="adminPage financePortal">
      <div className="container adminContainer">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">الإدارة المالية</p>
            <h1>الإعدادات المالية</h1>
          </div>

          <Link
            className="button secondary"
            href="/admin/finance"
          >
            العودة للنظرة العامة
          </Link>
        </div>

        <FinanceSettingsClient
          initialSettings={initialSettings}
          driveConnected={Boolean(driveConnection)}
        />
      </div>
    </main>
  );
}