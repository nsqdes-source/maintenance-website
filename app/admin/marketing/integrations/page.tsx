import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import IntegrationsManager from "./IntegrationsManager";

export const dynamic = "force-dynamic";

const MARKETING_KEYS = [
  "marketing_ga_measurement_id",
  "marketing_gtm_id",
  "marketing_google_ads_id",
  "marketing_meta_pixel_id",
  "marketing_tiktok_pixel_id",
  "marketing_snap_pixel_id",
  "marketing_x_pixel_id",
] as const;

export default async function MarketingIntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("site_settings").select("key,value").in("key", [...MARKETING_KEYS]),
  ]);

  const initialValues = Object.fromEntries(
    MARKETING_KEYS.map((key) => [key, rows?.find((row) => row.key === key)?.value ?? ""])
  );

  return (
    <IntegrationsManager
      initialValues={initialValues}
      canEdit={profile?.role === "super_admin"}
    />
  );
}
