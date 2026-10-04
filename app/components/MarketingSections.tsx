import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const steps = [
  ["01", "أرسل طلبك", "اختر الخدمة، صف المشكلة وأرفق صورًا إن وجدت."],
  ["02", "نراجع الطلب وننسق الموعد", "نراجع احتياجك ونتواصل لتأكيد التفاصيل والموعد."],
  ["03", "تعرف التكلفة قبل التنفيذ", "نوضح التكلفة قبل الإصلاح بعد التشخيص عند الحاجة."],
  ["04", "ننفذ ونتابع", "يبدأ العمل بعد موافقتك وتتابع معين الطلب حتى اكتماله."],
];

const faqs = [
  ["كيف أطلب خدمة؟", "اختر الخدمة، صف المشكلة، وحدد موقعك ثم أرسل الطلب."],
  ["هل أعرف السعر قبل التنفيذ؟", "نوضح التكلفة قبل الإصلاح بعد التشخيص عندما لا يكون نطاق العمل واضحًا."],
  ["هل يبدأ العمل مباشرة بعد المعاينة؟", "يبدأ بعد توضيح المطلوب والتكلفة والحصول على موافقتك."],
  ["ماذا يحدث إذا ظهر عمل إضافي؟", "لا ينفذ قبل شرحه والحصول على موافقتك."],
  ["هل يمكنني توفير قطعة الغيار؟", "نعم. لا تضمن معين القطعة التي يوفرها العميل، بينما يبقى ضمان التركيب خاضعًا لشروط الخدمة."],
  ["هل يوجد ضمان؟", "ضمان على الأعمال المشمولة وفق نوع الخدمة وشروط الضمان الموضحة في الطلب أو الفاتورة."],
  ["أين تتوفر خدمات معين؟", "نبدأ في حي العوالي ومناطق محددة في مكة المكرمة."],
];

export async function MarketingSections() {
  const supabase = await createClient();
  const { data: catalog } = await supabase
    .from("service_catalog_items")
    .select("id,name,description,price_from,pricing_mode")
    .eq("is_visible", true)
    .order("sort_order");

  const pricing = catalog?.length
    ? catalog.map((item) => [
        item.name,
        item.pricing_mode === "inspection"
          ? "السعر يحدد بعد المعاينة والتوضيح قبل التنفيذ."
          : `${item.description} — ${item.pricing_mode === "from" ? "يبدأ من" : "السعر"} ${item.price_from ?? 0} ر.س`,
      ])
    : [
        ["خدمة محددة", "سعر معروف مسبقًا عندما يسمح نطاق الخدمة."],
        ["عطل يحتاج تشخيصًا", "نشخّص المشكلة ثم نوضح التكلفة قبل الإصلاح."],
        ["عمل إضافي", "لا ينفذ قبل شرحه والحصول على موافقتك."],
      ];

  return (
    <>
      <section className="trustBar" style={{ order: 5 }}>
        <div className="container trustBarInner">
          <span>✓ تكلفة واضحة قبل التنفيذ</span>
          <span>✓ لا أعمال إضافية دون موافقتك</span>
          <span>✓ ضمان على الأعمال المشمولة</span>
        </div>
      </section>

      <section id="how-it-works" className="section marketingSection" style={{ order: 15 }}>
        <div className="container">
          <div className="compactSectionHeading">
            <div>
              <p className="eyebrow">كيف تعمل معين</p>
              <h2>رحلة صيانة واضحة من البداية للنهاية</h2>
            </div>
            <p>أربع خطوات مختصرة من إرسال الطلب حتى اكتمال الخدمة والمتابعة.</p>
          </div>
          <div className="marketingGrid four processGrid">
            {steps.map(([n, title, description]) => (
              <article className="marketingCard processCard" key={n}>
                <strong>{n}</strong>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section warrantySection warrantyBand" style={{ order: 27 }}>
        <div className="container">
          <div className="compactSectionHeading light">
            <div>
              <p className="eyebrow">الضمان والثقة</p>
              <h2>معين تتابع معك الخدمة بعد التنفيذ</h2>
            </div>
            <p>وضوح في تفاصيل العمل وموافقتك قبل أي أعمال إضافية، مع متابعة مطالبات الضمان.</p>
          </div>
          <div className="marketingGrid four warrantyGrid">
            {["الطلب موثق", "تفاصيل العمل واضحة", "موافقتك قبل الأعمال الإضافية", "متابعة لمطالبات الضمان"].map((title) => (
              <article className="marketingCard compact warrantyCard" key={title}>
                <h3>✓ {title}</h3>
              </article>
            ))}
          </div>
          <p className="policyNote">ضمان على الأعمال المشمولة وفق نوع الخدمة وشروط الضمان الموضحة في الطلب أو الفاتورة.</p>
        </div>
      </section>

      <section id="faq" className="section faqSection" style={{ order: 29 }}>
        <div className="container">
          <div className="compactSectionHeading">
            <div>
              <p className="eyebrow">الأسئلة الشائعة</p>
              <h2>إجابات واضحة قبل طلب الخدمة</h2>
            </div>
            <p>أهم ما يحتاج العميل معرفته قبل إرسال الطلب.</p>
          </div>
          <div className="faqList compactFaqGrid">
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section multiAcSection compactPromoSection" style={{ order: 30 }}>
        <div className="container ctaBox compactPromo">
          <div>
            <p className="eyebrow">خدمة أذكى للمنزل</p>
            <h2>أكثر من مكيف؟ اجمعها في زيارة واحدة</h2>
            <p>اذكر عدد المكيفات واحتياج كل جهاز في الطلب، وسننسقها معك في زيارة واحدة قدر الإمكان.</p>
          </div>
          <Link className="button lightButton" href="/request">اطلب خدمة التكييف</Link>
        </div>
      </section>

      <section className="section pricingSection compactPricingSection" style={{ order: 31 }}>
        <div className="container">
          <div className="compactSectionHeading">
            <div>
              <p className="eyebrow">آلية التسعير</p>
              <h2>تعرف ما ستدفعه قبل أن يبدأ العمل</h2>
            </div>
            <p>طريقة التسعير تختلف حسب الخدمة، لكن التكلفة توضّح قبل التنفيذ.</p>
          </div>
          <div className="marketingGrid pricingCompactGrid">
            {pricing.map(([title, description]) => (
              <article className="marketingCard" key={title}>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section serviceAreaSection compactServiceArea" style={{ order: 32 }}>
        <div className="container serviceAreaCompactBox">
          <div>
            <p className="eyebrow">منطقة الخدمة</p>
            <h2>نخدمك في مكة المكرمة</h2>
          </div>
          <p>نبدأ حاليًا في حي العوالي ومناطق محددة في مكة، ونعمل على توسيع نطاق الخدمة تدريجيًا.</p>
        </div>
      </section>
    </>
  );
}
