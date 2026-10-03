export const MARKETING_FUNNEL_EVENTS = [
  { name: "view_service", label: "عرض صفحة خدمة", stage: "الاهتمام", source: "صفحات الخدمات" },
  { name: "start_request", label: "بدء طلب الخدمة", stage: "بدء الطلب", source: "نموذج الطلب" },
  { name: "select_service", label: "اختيار الخدمة", stage: "الخدمة", source: "نموذج الطلب" },
  { name: "select_issue", label: "إكمال وصف المشكلة", stage: "التفاصيل", source: "نموذج الطلب" },
  { name: "upload_photo", label: "إرفاق صورة", stage: "التفاصيل", source: "نموذج الطلب" },
  { name: "select_location", label: "تحديد الموقع", stage: "الموقع", source: "نموذج الطلب" },
  { name: "select_preferred_time", label: "اختيار الموعد", stage: "الموعد", source: "نموذج الطلب" },
  { name: "generate_lead", label: "إرسال طلب ناجح", stage: "التحويل", source: "نموذج الطلب" },
] as const;

export type MarketingFunnelEventName = (typeof MARKETING_FUNNEL_EVENTS)[number]["name"];
