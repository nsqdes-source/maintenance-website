import type { Metadata } from "next";
import RequestFunnel from "./RequestFunnel";
import { getLocale, text } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "طلب خدمة | معين لخدمات الصيانة",
  description:
    "أرسل طلبك إلى معين وحدد الخدمة والمشكلة والموقع والموعد المفضل بخطوات واضحة.",
  alternates: { canonical: "/request" },
};

export default async function RequestPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => text(locale, ar, en);

  const supabase = await createClient();

  const [{ data: categories }, { data: services }] = await Promise.all([
    supabase
      .from("service_catalog_items")
      .select("id,name,service_key,sort_order")
      .is("parent_id", null)
      .eq("is_visible", true)
      .order("sort_order"),

    supabase
      .from("service_catalog_services")
      .select(
        "id,service_catalog_item_id,name,description,gross_price,is_visit_service,sort_order"
      )
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  return (
    <main className="request-page">
      <section className="request-section">
        <div className="request-container">
          <header className="request-header">
            <p className="eyebrow">{t("طلب خدمة", "Service request")}</p>

            <h1>{t("اطلب خدمة صيانة", "Request maintenance")}</h1>

            <p>
              {t(
                "املأ البيانات التالية وسيتواصل معك فريقنا لتأكيد الطلب وتحديد موعد الخدمة.",
                "Enter your details and our team will contact you to confirm the request and schedule a visit."
              )}
            </p>
          </header>

          <RequestFunnel
            initialCategories={categories ?? []}
            initialServices={services ?? []}
          />
        </div>
      </section>
    </main>
  );
}