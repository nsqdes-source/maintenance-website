export type AdminNavigationRoute = {
  href: string;
  label: string;
  exact?: boolean;
  roles?: readonly string[];
};

export type AdminNavigationSection = {
  id: string;
  label: string;
  roles?: readonly string[];
  routes: readonly AdminNavigationRoute[];
};

const seniorRoles = ["admin_manager", "super_admin"] as const;

export const adminNavigationSections: readonly AdminNavigationSection[] = [
  { id: "overview", label: "نظرة عامة", routes: [{ href: "/admin", label: "نظرة عامة", exact: true }] },
  {
    id: "operations", label: "التشغيل", routes: [
      { href: "/admin/requests", label: "الطلبات" },
      { href: "/admin/technicians", label: "الفنيون" },
      { href: "/admin/warranty", label: "مطالبات الضمان" },
      { href: "/admin/users", label: "المستخدمون" },
      { href: "/admin/contact", label: "رسائل الموقع" },
      { href: "/admin/roles", label: "الأدوار والصلاحيات", roles: ["super_admin"] },
    ],
  },
  {
    id: "catalog", label: "الخدمات والأسعار", routes: [
      { href: "/admin/catalog", label: "نظرة عامة" },
      { href: "/admin/catalog#catalog-categories", label: "التصنيفات الرئيسية" },
      { href: "/admin/catalog#catalog-services", label: "الخدمات الفرعية" },
      { href: "/admin/catalog#catalog-parts", label: "القطع والأسعار" },
    ],
  },
  {
    id: "finance", label: "المالية", roles: seniorRoles, routes: [
      { href: "/admin/finance", label: "نظرة عامة", exact: true },
      { href: "/admin/finance/invoices", label: "الفواتير" },
      { href: "/admin/finance/payments", label: "التحصيلات" },
      { href: "/admin/finance/expenses", label: "المصروفات" },
      { href: "/admin/finance/reports", label: "التقارير" },
      { href: "/admin/finance/settings", label: "الإعدادات" },
    ],
  },
  { id: "marketing", label: "التسويق", roles: seniorRoles, routes: [{ href: "/admin/marketing", label: "نظرة عامة" }] },
  {
    id: "site", label: "إعدادات الموقع", routes: [
      { href: "/admin/site", label: "محرر الموقع", roles: ["super_admin"] },
      { href: "/admin/dashboard", label: "عرض اللوحات" },
    ],
  },
];

export function isAdminNavigationVisible(item: { roles?: readonly string[] }, role: string | null | undefined) {
  return !item.roles || (role != null && item.roles.includes(role));
}

export function getVisibleAdminSections(role: string | null | undefined): AdminNavigationSection[] {
  return adminNavigationSections
    .filter(section => isAdminNavigationVisible(section, role))
    .map(section => ({ ...section, routes: section.routes.filter(route => isAdminNavigationVisible(route, role)) }))
    .filter(section => section.routes.length > 0);
}

export function matchesAdminRoute(pathname: string, route: AdminNavigationRoute) {
  const path = pathname.replace(/\/$/, "") || "/";
  return path === route.href || (!route.exact && path.startsWith(`${route.href}/`));
}

export function getActiveAdminSection(pathname: string, sections: readonly AdminNavigationSection[]) {
  // Section matching includes descendants; tab matching keeps overview routes exact.
  return sections.find(section => section.routes.some(route =>
    matchesAdminRoute(pathname, { ...route, exact: route.href === "/admin" })
  ));
}

export function getActiveAdminRoute(pathname: string, section: AdminNavigationSection | undefined) {
  return section?.routes.filter(route => matchesAdminRoute(pathname, route))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
