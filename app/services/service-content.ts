export type LocalizedText = { ar: string; en: string };

export type ServiceSection = {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  points?: LocalizedText[];
};

export type ServicePageContent = {
  slug: "ac" | "plumbing" | "electrical" | "carpentry";
  icon: string;
  name: LocalizedText;
  eyebrow: LocalizedText;
  title: LocalizedText;
  description: LocalizedText;
  scope: LocalizedText;
  issues: LocalizedText[];
  sections: ServiceSection[];
  faqs: Array<{ question: LocalizedText; answer: LocalizedText }>;
};

const commonFaqs: ServicePageContent["faqs"] = [
  {
    question: { ar: "هل أعرف التكلفة قبل التنفيذ؟", en: "Will I know the cost before work begins?" },
    answer: { ar: "نوضح التكلفة قبل بدء الإصلاح بعد تحديد نطاق الخدمة أو تشخيص سبب العطل عند الحاجة.", en: "We explain the cost before repair begins, after confirming the scope or diagnosing the issue when needed." },
  },
  {
    question: { ar: "ماذا لو ظهر عمل إضافي؟", en: "What if additional work is needed?" },
    answer: { ar: "نشرح العمل الإضافي وتكلفته، ولا ننفذه قبل الحصول على موافقتك.", en: "We explain the extra work and its cost, and do not proceed without your approval." },
  },
  {
    question: { ar: "هل يوجد ضمان؟", en: "Is there a warranty?" },
    answer: { ar: "يوجد ضمان على الأعمال المشمولة وفق نوع الخدمة والشروط الموضحة في الطلب أو الفاتورة.", en: "Covered work is warranted according to the service type and the terms shown in the request or invoice." },
  },
];

export const serviceCatalog: ServicePageContent[] = [
  {
    slug: "ac",
    icon: "❄",
    name: { ar: "التكييف", en: "Air conditioning" },
    eyebrow: { ar: "خدمات تكييف في مكة", en: "Air-conditioning services in Makkah" },
    title: { ar: "صيانة وتنظيف مكيفات السبليت والشباك", en: "Split and window AC maintenance and cleaning" },
    description: { ar: "نساعدك في تنظيف المكيف وتشخيص ضعف التبريد والتسريب والأعطال، مع توضيح المطلوب والتكلفة قبل التنفيذ.", en: "We clean AC units and diagnose weak cooling, leaks and faults, with clear scope and cost before work begins." },
    scope: { ar: "نطاق الإطلاق الحالي: مكيفات السبليت والشباك.", en: "Current launch scope: split and window AC units." },
    issues: [
      { ar: "تنظيف", en: "Cleaning" },
      { ar: "ضعف تبريد", en: "Weak cooling" },
      { ar: "تسريب ماء", en: "Water leak" },
      { ar: "لا يعمل", en: "Not working" },
      { ar: "صوت أو رائحة", en: "Noise or odor" },
      { ar: "فك أو تركيب", en: "Removal or installation" },
    ],
    sections: [
      { id: "cleaning", title: { ar: "تنظيف المكيف", en: "AC cleaning" }, description: { ar: "تنظيف منظم للأجزاء المشمولة بالخدمة للمساعدة في تحسين تدفق الهواء وكفاءة التشغيل، بعد فحص حالة الجهاز.", en: "Organized cleaning of covered components to support airflow and operating efficiency after checking the unit." }, points: [{ ar: "سبليت وشباك", en: "Split and window units" }, { ar: "فحص الحالة قبل البدء", en: "Condition checked first" }] },
      { id: "weak-cooling", title: { ar: "ضعف التبريد", en: "Weak cooling" }, description: { ar: "ضعف التبريد له أسباب متعددة؛ لذلك نشخّص السبب قبل اقتراح الإصلاح. لا نسوّق تعبئة الفريون كحل افتراضي مستقل.", en: "Weak cooling has several possible causes, so we diagnose first. Refrigerant refill is not presented as a default standalone fix." }, points: [{ ar: "تشخيص السبب", en: "Cause diagnosis" }, { ar: "عرض الإجراء قبل التنفيذ", en: "Action explained before work" }] },
      { id: "water-leak", title: { ar: "تسريب الماء", en: "Water leakage" }, description: { ar: "نفحص مسار التصريف والحالة العامة للمكيف لتحديد سبب التسريب ومعالجة الجزء المشمول بعد موافقتك.", en: "We check drainage and the unit condition to identify the leak source and address covered work after approval." } },
      { id: "not-working", title: { ar: "المكيف لا يعمل", en: "AC not working" }, description: { ar: "نفحص الأعراض والمكونات ذات الصلة لتحديد العطل، ثم نوضح نطاق الإصلاح والتكلفة قبل التنفيذ.", en: "We inspect symptoms and relevant components, then explain repair scope and cost before work." } },
      { id: "noise-odor", title: { ar: "صوت أو رائحة", en: "Noise or odor" }, description: { ar: "الأصوات أو الروائح غير المعتادة قد تشير إلى حاجة للتنظيف أو الفحص؛ نحدد السبب قبل اقتراح الحل.", en: "Unusual noise or odor may require cleaning or inspection; we identify the cause before proposing a solution." } },
      { id: "installation", title: { ar: "فك وتركيب", en: "Removal and installation" }, description: { ar: "تنسيق أعمال الفك أو التركيب لمكيفات السبليت والشباك ضمن نطاق الخدمة وبعد مراجعة الموقع والمتطلبات.", en: "Coordinated removal or installation for split and window units after reviewing site requirements." } },
    ],
    faqs: [
      { question: { ar: "هل تعبئة الفريون هي الحل دائمًا لضعف التبريد؟", en: "Is refrigerant refill always the solution for weak cooling?" }, answer: { ar: "لا. يجب تشخيص سبب ضعف التبريد أولًا، وقد يكون السبب مختلفًا من جهاز لآخر.", en: "No. The cause must be diagnosed first and can differ from one unit to another." } },
      { question: { ar: "هل يمكن طلب خدمة لأكثر من مكيف؟", en: "Can I request service for several units?" }, answer: { ar: "نعم، اذكر عدد المكيفات واحتياج كل جهاز في وصف الطلب لننسقها في زيارة واحدة قدر الإمكان.", en: "Yes. Include the number of units and what each needs so we can coordinate one visit where possible." } },
      ...commonFaqs,
    ],
  },
  {
    slug: "plumbing",
    icon: "◉",
    name: { ar: "السباكة", en: "Plumbing" },
    eyebrow: { ar: "خدمات سباكة في مكة", en: "Plumbing services in Makkah" },
    title: { ar: "حلول واضحة لمشكلات السباكة المنزلية", en: "Clear solutions for household plumbing issues" },
    description: { ar: "معالجة التسريبات والانسدادات ومشكلات الخلاطات والصمامات وتدفق المياه ضمن نطاق الخدمة.", en: "Leak, blockage, faucet, valve and water-flow services within our operating scope." },
    scope: { ar: "صف موضع المشكلة وأرفق صورًا إن أمكن لتسهيل التقييم.", en: "Describe the location of the issue and attach photos when possible." },
    issues: [{ ar: "تسريب مياه", en: "Water leaks" }, { ar: "انسداد", en: "Blockages" }, { ar: "خلاطات وصمامات", en: "Faucets and valves" }, { ar: "مشكلات الحمامات", en: "Bathroom issues" }, { ar: "ضعف تدفق المياه", en: "Low water flow" }],
    sections: [
      { id: "leaks", title: { ar: "التسريبات", en: "Leaks" }, description: { ar: "نحدد مصدر التسريب الظاهر ونوضح نطاق المعالجة قبل التنفيذ.", en: "We identify the visible source and explain the repair scope before work." } },
      { id: "blockages", title: { ar: "الانسدادات والتدفق", en: "Blockages and flow" }, description: { ar: "فحص المشكلة وتحديد الإجراء المناسب للانسداد أو ضعف التدفق ضمن النطاق المتاح.", en: "We inspect the issue and determine the appropriate action for blockages or low flow." } },
      { id: "fixtures", title: { ar: "الخلاطات والصمامات", en: "Faucets and valves" }, description: { ar: "إصلاح أو استبدال القطع المشمولة بعد توضيح المطلوب، مع إمكانية توفير العميل للقطعة وفق سياسة الخدمة.", en: "Covered repair or replacement after scope confirmation; customers may supply parts under the service policy." } },
    ],
    faqs: commonFaqs,
  },
  {
    slug: "electrical",
    icon: "ϟ",
    name: { ar: "الكهرباء", en: "Electrical" },
    eyebrow: { ar: "خدمات كهربائية منزلية في مكة", en: "Home electrical services in Makkah" },
    title: { ar: "صيانة كهربائية منزلية ضمن نطاق واضح", en: "Home electrical maintenance with a clear scope" },
    description: { ar: "خدمات للمقابس والمفاتيح والإنارة والقواطع والأعطال الكهربائية المنزلية ضمن نطاق الخدمة.", en: "Services for outlets, switches, lighting, breakers and household electrical faults within scope." },
    scope: { ar: "الأولوية للسلامة؛ لا يبدأ العمل قبل فهم العطل وتحديد الإجراء المناسب.", en: "Safety comes first; work begins only after understanding the fault and the appropriate action." },
    issues: [{ ar: "مقابس ومفاتيح", en: "Outlets and switches" }, { ar: "إنارة", en: "Lighting" }, { ar: "قواطع", en: "Breakers" }, { ar: "أعطال كهربائية منزلية", en: "Household electrical faults" }],
    sections: [
      { id: "outlets", title: { ar: "المقابس والمفاتيح", en: "Outlets and switches" }, description: { ar: "فحص الأعطال الظاهرة والإصلاح أو الاستبدال ضمن نطاق الخدمة وبعد توضيح التكلفة.", en: "Inspection and covered repair or replacement after cost clarification." } },
      { id: "lighting", title: { ar: "الإنارة", en: "Lighting" }, description: { ar: "معالجة مشكلات وحدات الإنارة والتوصيلات المرتبطة بها ضمن نطاق العمل المنزلي.", en: "Addressing lighting fixtures and related connections within household scope." } },
      { id: "breakers", title: { ar: "القواطع والأعطال", en: "Breakers and faults" }, description: { ar: "تشخيص أولي للأعراض وتحديد ما إذا كانت المعالجة ضمن نطاق الخدمة قبل التنفيذ.", en: "Initial diagnosis to confirm whether the issue is within service scope before work." } },
    ],
    faqs: commonFaqs,
  },
  {
    slug: "carpentry",
    icon: "⌑",
    name: { ar: "النجارة", en: "Carpentry" },
    eyebrow: { ar: "خدمات نجارة منزلية في مكة", en: "Home carpentry services in Makkah" },
    title: { ar: "إصلاحات نجارة منزلية دقيقة ومنظمة", en: "Organized household carpentry repairs" },
    description: { ar: "إصلاح وضبط الأبواب والخزائن والأدراج والمفصلات وأعمال النجارة المنزلية البسيطة.", en: "Repair and adjustment of doors, cabinets, drawers, hinges and light household carpentry." },
    scope: { ar: "الصور تساعدنا كثيرًا في تقييم أعمال النجارة قبل تنسيق الزيارة.", en: "Photos are especially useful for assessing carpentry work before arranging a visit." },
    issues: [{ ar: "أبواب", en: "Doors" }, { ar: "خزائن", en: "Cabinets" }, { ar: "أدراج", en: "Drawers" }, { ar: "مفصلات", en: "Hinges" }, { ar: "إصلاحات منزلية بسيطة", en: "Light household repairs" }],
    sections: [
      { id: "doors", title: { ar: "الأبواب والمفصلات", en: "Doors and hinges" }, description: { ar: "ضبط وإصلاح المشكلات المشمولة بعد تقييم الحالة وتوضيح الإجراء.", en: "Adjustment and covered repairs after assessing the condition and explaining the work." } },
      { id: "cabinets", title: { ar: "الخزائن والأدراج", en: "Cabinets and drawers" }, description: { ar: "إصلاحات منزلية بسيطة للخزائن والأدراج والقطع المرتبطة بها ضمن نطاق الخدمة.", en: "Light household repairs for cabinets, drawers and related parts within scope." } },
      { id: "photos", title: { ar: "صوّر المشكلة", en: "Photograph the issue" }, description: { ar: "أرفق صورًا واضحة للمشكلة والمكان المحيط بها؛ فهي تساعدنا في فهم الاحتياج قبل الزيارة.", en: "Attach clear photos of the issue and surrounding area to help us assess the need before the visit." } },
    ],
    faqs: commonFaqs,
  },
];

export function getService(slug: ServicePageContent["slug"]) {
  return serviceCatalog.find((service) => service.slug === slug)!;
}
