import type { Metadata } from "next";
import RequestFunnel from "./RequestFunnel";
import { getLocale, text } from "@/lib/locale";

export const metadata: Metadata = {
  title: "طلب خدمة | معين لخدمات الصيانة",
  description: "أرسل طلبك إلى معين وحدد الخدمة والمشكلة والموقع والموعد المفضل بخطوات واضحة.",
  alternates: { canonical: "/request" },
};

export default async function RequestPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => text(locale, ar, en);
  return (
    <main className="request-page">
      <section className="request-section">
        <div className="request-container">
          <header className="request-header">
            <p className="eyebrow">{t("طلب خدمة","Service request")}</p>
            <h1>{t("اطلب خدمة صيانة","Request maintenance")}</h1>
            <p>{t("املأ البيانات التالية وسيتواصل معك فريقنا لتأكيد الطلب وتحديد موعد الخدمة.","Enter your details and our team will contact you to confirm the request and schedule a visit.")}</p>
          </header>
          <RequestFunnel />
        </div>
      </section>
    </main>
  );
}
