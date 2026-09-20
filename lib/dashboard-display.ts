export type DashboardCard = { id: string; visible: boolean };

export const CUSTOMER_DASHBOARD_CARDS = [
  { id: "new_request", label: "زر طلب خدمة جديد", description: "يبقي إنشاء الطلب ظاهرًا في مقدمة لوحة العميل." },
  { id: "requests", label: "طلبات العميل", description: "يعرض حالة الطلبات وتفاصيلها وإجراءات العميل." },
] as const;

export const TECHNICIAN_DASHBOARD_CARDS = [
  { id: "summary", label: "ملخص الأداء", description: "يعرض أعداد الطلبات الحالية والمنفذة وحالة الفني." },
  { id: "assignments", label: "الإسنادات", description: "يعرض الطلبات المسندة وإجراءات قبولها وتنفيذها." },
] as const;

type CardDefinition = { id: string };

export function normalizeDashboardCards(value: unknown, definitions: readonly CardDefinition[]): DashboardCard[] {
  const stored = Array.isArray(value) ? value : [];
  const byId = new Map(stored.filter((item): item is DashboardCard => Boolean(item) && typeof item === "object" && typeof (item as DashboardCard).id === "string").map(item => [item.id, item]));
  const ordered = stored
    .filter((item): item is DashboardCard => Boolean(item) && typeof item === "object" && typeof (item as DashboardCard).id === "string" && definitions.some(definition => definition.id === (item as DashboardCard).id))
    .map(item => ({ id: item.id, visible: item.visible !== false }));
  const missing = definitions.filter(definition => !byId.has(definition.id)).map(definition => ({ id: definition.id, visible: true }));
  return [...ordered, ...missing];
}

export function dashboardCardStyle(cards: DashboardCard[], id: string) {
  const index = cards.findIndex(card => card.id === id);
  const card = cards[index];
  return { display: card?.visible === false ? "none" : undefined, order: index === -1 ? 999 : index } as const;
}
