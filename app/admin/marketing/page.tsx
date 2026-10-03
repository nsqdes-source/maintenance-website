import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const roles = new Set(["admin_manager", "super_admin"]);

export default async function MarketingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !roles.has(profile.role)) redirect("/admin");

  return (
    <main className="adminPage">
      <div className="container adminContainer">
        <div className="adminTopbar"><h1>التسويق</h1></div>
        <p>سيتم تجهيز أدوات التسويق في مرحلة لاحقة.</p>
      </div>
    </main>
  );
}
