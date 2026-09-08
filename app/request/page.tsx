import type { Metadata } from "next";
import RequestForm from "./RequestForm";

export const metadata: Metadata = {
  title: "طلب خدمة | خدمات الصيانة العامة",
  description: "أرسل طلب صيانة وسنتواصل معك.",
};

export default function RequestPage() {
  return (
    <main className="request-page">
      <section className="request-section">
        <div className="request-container">
          <header className="request-header">
            <p className="eyebrow">طلب خدمة</p>
            <h1>اطلب خدمة صيانة</h1>
            <p>املأ البيانات التالية وسيتواصل معك فريقنا لتأكيد الطلب وتحديد موعد الخدمة.</p>
          </header>
          <RequestForm />
        </div>
      </section>
    </main>
  );
}
