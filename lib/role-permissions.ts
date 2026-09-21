export type AppRole = "customer" | "technician" | "maintenance_manager" | "admin_manager" | "super_admin";

export type RoleDefinition = {
  role: AppRole;
  label: string;
  purpose: string;
  permissions: string[];
  restrictions: string[];
};

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    role: "customer",
    label: "العميل",
    purpose: "متابعة طلباته وقراراته ومستنداته فقط.",
    permissions: ["إنشاء الطلبات ومتابعة طلباته", "قبول أو رفض عرض الإصلاح", "عرض الفواتير الصادرة الخاصة به", "رفع مطالبة ضمان لبند ساري"],
    restrictions: ["لا يرى طلبات أو بيانات عملاء آخرين", "لا يدخل لوحات الإدارة أو الفنيين"],
  },
  {
    role: "technician",
    label: "الفني",
    purpose: "تنفيذ الإسنادات المسندة إليه وتوثيق نتيجة الزيارة.",
    permissions: ["عرض الإسنادات الخاصة به", "قبول أو رفض الإسناد", "تسجيل نتيجة الزيارة والقطع المطلوبة", "رفع صور الزيارة اختياريًا"],
    restrictions: ["لا يرى المالية أو المستخدمين", "لا يعدل طلبًا غير مسند إليه"],
  },
  {
    role: "maintenance_manager",
    label: "مدير الصيانة",
    purpose: "إدارة التشغيل اليومي للطلبات والفنيين.",
    permissions: ["إسناد الطلبات وإدارة مراحلها", "إعداد عروض الإصلاح", "إدارة الفنيين والكتالوج", "متابعة رسائل الموقع والضمان", "تعديل عرض بطاقات اللوحات"],
    restrictions: ["لا يدخل المالية", "لا يدخل محرر الموقع", "لا يمنح أدوارًا مساوية أو أعلى منه"],
  },
  {
    role: "admin_manager",
    label: "المدير الإداري",
    purpose: "إدارة التشغيل والمالية والمستخدمين دون صلاحيات النظام العليا.",
    permissions: ["جميع صلاحيات مدير الصيانة", "إدارة مسودات الفواتير وإصدارها والتحصيل", "إدارة أدوار المستخدمين الأدنى", "إرسال الفواتير وربطها بالمستندات"],
    restrictions: ["لا يدخل محرر الموقع", "لا يمنح دور مدير إداري أو مسؤول نظام", "لا يغير دوره الشخصي"],
  },
  {
    role: "super_admin",
    label: "مسؤول النظام",
    purpose: "التحكم الكامل في التشغيل والإعدادات الحساسة.",
    permissions: ["جميع صلاحيات الإدارة", "محرر الموقع والهوية", "منح وإدارة الأدوار الإدارية", "مراجعة مصفوفة الصلاحيات"],
    restrictions: ["لا يغير دوره الشخصي من الواجهة", "تظل سياسات RLS ودوال قاعدة البيانات هي الحاجز الأمني النهائي"],
  },
];

export const MANAGEMENT_ROLES = new Set<AppRole>(["maintenance_manager", "admin_manager", "super_admin"]);
export const FINANCE_ROLES = new Set<AppRole>(["admin_manager", "super_admin"]);
