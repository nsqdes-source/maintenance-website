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

      {whatsappUrl ? (
        <a
          className="floatingWhatsApp"
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={t("تواصل عبر واتساب", "Contact us on WhatsApp")}
          title={t("تواصل عبر واتساب", "Contact us on WhatsApp")}
        >
          <svg
            viewBox="0 0 32 32"
            aria-hidden="true"
            width="30"
            height="30"
            fill="currentColor"
          >
            <path d="M19.11 17.32c-.27-.14-1.59-.78-1.84-.87-.25-.09-.43-.14-.61.14-.18.27-.7.87-.86 1.05-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.17-1.34-.8-.71-1.34-1.59-1.5-1.86-.16-.27-.02-.42.12-.55.12-.12.27-.32.41-.48.14-.16.18-.27.27-.46.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.02-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.29s.98 2.65 1.12 2.84c.14.18 1.93 2.95 4.68 4.14.65.28 1.16.45 1.56.58.65.21 1.25.18 1.72.11.52-.08 1.59-.65 1.82-1.28.23-.63.23-1.16.16-1.28-.07-.11-.25-.18-.52-.32z" />
            <path d="M16.03 3.2c-7.05 0-12.78 5.73-12.78 12.78 0 2.25.59 4.45 1.71 6.39L3.14 29l6.79-1.78a12.75 12.75 0 0 0 6.1 1.55h.01c7.05 0 12.78-5.73 12.78-12.78S23.08 3.2 16.03 3.2zm0 23.4h-.01c-1.91 0-3.78-.51-5.41-1.48l-.39-.23-4.03 1.06 1.08-3.93-.25-.4a10.59 10.59 0 1 1 9.01 4.98z" />
          </svg>
        </a>
      ) : null}
    </footer>
  );
}
