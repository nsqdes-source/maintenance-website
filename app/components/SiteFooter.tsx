import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLocale, text } from "@/lib/locale";

export default async function SiteFooter({ order }: { order?: number }) {
  const locale = await getLocale();
  const t = (ar: string, en: string) => text(locale, ar, en);
  const supabase = await createClient();
  const [{ data }, { data: settingsRows }] = await Promise.all([
    supabase.from("site_footer_content").select("company_name, description, phone, email, address, copyright_text, business_center_label, business_center_url, business_center_logo_url, payment_methods, payment_logo_urls").eq("id", true).maybeSingle(),
    supabase.from("site_settings").select("key,value").in("key", ["footer_request_cta_visible", "mobile_request_cta_visible", "request_cta_text", "request_cta_text_en"]),
  ]);
  const settings = Object.fromEntries((settingsRows ?? []).map(row => [row.key, row.value]));

  const paymentMethods = Array.isArray(data?.payment_methods) ? data.payment_methods.filter((item): item is string => typeof item === "string") : [];
  const paymentLogoUrls = data?.payment_logo_urls && typeof data.payment_logo_urls === "object" && !Array.isArray(data.payment_logo_urls) ? data.payment_logo_urls as Record<string, string> : {};
  const phoneDigits = data?.phone?.replace(/\D/g, "");
  const whatsappNumber = phoneDigits?.startsWith("966") ? phoneDigits : phoneDigits?.startsWith("0") ? `966${phoneDigits.slice(1)}` : undefined;
  const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : undefined;

  return (
    <footer className="footer" style={order === undefined ? undefined : { order }}>
      <div className="container footerInner">
        <section className="footerBrand">
          <div className="logo"><img className="footerLogo" src="/mueen-logo.png" alt="" /><span>{data?.company_name ?? "معين لخدمات الصيانة"}</span></div>
          <p className="footerDescription">{data?.description ?? "معين.. الصيانة أسهل"}</p>
          <div className="footerContacts">{data?.address ? <span>{data.address}</span> : null}{data?.phone ? <a href={`tel:${data.phone}`}>{data.phone}</a> : null}{whatsappUrl ? <a className="whatsAppLink" href={whatsappUrl} target="_blank" rel="noreferrer">واتساب</a> : null}{data?.email ? <a href={`mailto:${data.email}`}>{data.email}</a> : null}</div>
        </section>
        <section className="footerLinks"><h3>{t("روابط مهمة", "Useful links")}</h3><Link href="/services">{t("الخدمات", "Services")}</Link><Link href="/#how-it-works">{t("كيف نعمل", "How it works")}</Link><Link href="/#faq">{t("الأسئلة الشائعة", "FAQ")}</Link><Link href="/#contact">{t("تواصل معنا", "Contact")}</Link>{settings.footer_request_cta_visible !== "false" ? <Link href="/request">{t("طلب خدمة", "Request service")}</Link> : null}<Link href="/privacy">{t("سياسة الخصوصية", "Privacy policy")}</Link><Link href="/terms">{t("الشروط والأحكام", "Terms")}</Link><Link href="/warranty">{t("سياسة الضمان", "Warranty")}</Link><Link href="/service-policy">{t("سياسة الخدمة", "Service policy")}</Link>{data?.business_center_url ? <a className="businessCentreLink" href={data.business_center_url}><span className="businessCentreLogo">{data.business_center_logo_url ? <img src={data.business_center_logo_url} alt="" /> : "▦"}</span><span>{data.business_center_label ?? t("مركز الأعمال", "Business centre")}</span></a> : null}</section>
        <section className="footerPayment"><h3>{t("طرق السداد", "Payment methods")}</h3><p>{t("اخترنا الوسائل التي تناسب خدماتنا.", "Available payment options.")}</p><div className="paymentMarks">{paymentMethods.map(method => paymentLogoUrls[method] ? <img key={method} className="paymentLogo" src={paymentLogoUrls[method]} alt="" /> : null)}</div><span className="footerCopyright">{data?.copyright_text ?? "© 2026 جميع الحقوق محفوظة"}</span></section>
      </div>
      {settings.mobile_request_cta_visible !== "false" || whatsappUrl ? <div className={`mobileQuickActions ${settings.mobile_request_cta_visible === "false" ? "whatsappOnly" : ""}`}>{settings.mobile_request_cta_visible !== "false" ? <Link className="requestQuickAction" href="/request">{locale === "en" ? settings.request_cta_text_en || "Request service" : settings.request_cta_text || "اطلب خدمة"}</Link> : null}{whatsappUrl ? <a className="whatsappQuickAction" href={whatsappUrl} target="_blank" rel="noreferrer">{t("واتساب", "WhatsApp")}</a> : null}</div> : null}
      {whatsappUrl ? <a className="floatingWhatsApp" href={whatsappUrl} target="_blank" rel="noreferrer" aria-label={t("تواصل عبر واتساب", "Contact us on WhatsApp")} title={t("تواصل عبر واتساب", "Contact us on WhatsApp")}><span aria-hidden>☎</span></a> : null}
    </footer>
  );
}
