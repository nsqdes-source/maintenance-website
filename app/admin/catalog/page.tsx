import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CatalogManager from "./CatalogManager";
import styles from "./CatalogManager.module.css";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
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

  if (
    !["maintenance_manager", "admin_manager", "super_admin"].includes(
      profile?.role || ""
    )
  ) {
    redirect("/account");
  }

  const [
    { data: items },
    { data: services },
    { data: parts },
  ] = await Promise.all([
    supabase
      .from("service_catalog_items")
      .select(
        "id,service_key,name,description,price_from,pricing_mode,is_visible,sort_order,parent_id"
      )
      .order("sort_order"),

    supabase
      .from("service_catalog_services")
      .select(
        "id,service_catalog_item_id,name,description,net_price,tax_rate,gross_price,is_visit_service,is_active,sort_order"
      )
      .order("sort_order"),

    supabase
      .from("service_catalog_parts")
      .select(
      "id,service_catalog_item_id,name,default_price,tax_rate,gross_price,is_active,sort_order"
      )
      .order("sort_order"),
  ]);

  return (
    <main className="adminPage">
        <div className="container adminContainer">
          <nav
            className={styles.navigation}
            aria-label="التنقل داخل كتالوج الخدمة"
          >
            <a href="#catalog-categories">تصنيف الخدمات</a>
            <a href="#catalog-services">الخدمات الفرعية</a>
            <a href="#catalog-parts">القطع</a>
          </nav>

            <div className="adminTopbar">

        <CatalogManager
          initialItems={items ?? []}
          initialServices={services ?? []}
          initialParts={parts ?? []}
        />
      </div>
    </main>
  );
}