import Link from "next/link";

import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import RequestTechnicianControl from "@/app/admin/RequestTechnicianControl";

import WorkflowAdvanceControl from "@/app/admin/WorkflowAdvanceControl";

import QuoteAdminControl from "@/app/admin/QuoteAdminControl";

import ServiceRequestPaymentControl from "@/app/admin/ServiceRequestPaymentControl";

import RequestWorkflowActions from "@/app/admin/RequestWorkflowActions";

import RequestImages from "@/app/components/RequestImages";



export const dynamic = "force-dynamic";



const ADMIN_ROLES = new Set([

  "maintenance_manager",

  "admin_manager",

  "super_admin",

]);



const WORKFLOW_LABELS: Record<string, string> = {

  awaiting_assignment: "بانتظار الإسناد",

  assigned: "تم إسناده",

  technician_accepted: "وافق الفني",

  in_progress: "قيد التنفيذ",

  awaiting_completion_review: "بانتظار مراجعة الإدارة",

  reschedule_requested: "طلب إعادة جدولة",

  unable_to_complete: "تعذر التنفيذ",

  awaiting_admin_quote: "بانتظار عرض الإدارة",

  awaiting_customer_approval: "بانتظار موافقة العميل",

  quote_approved: "وافق العميل",

  completed: "تم التنفيذ",

  needs_followup: "بحاجة إلى قطعة / تعديل",

  customer_rejected: "العميل رفض الإصلاح",

  cancelled: "ملغي",

  customer_cancelled: "ألغاه العميل",

};



const ASSIGNMENT_LABELS: Record<string, string> = {

  pending: "قيد الانتظار",

  accepted: "مقبول",

  rejected: "مرفوض",

  completed: "مكتمل",

  cancelled: "ملغي",

  customer_cancelled: "ألغاه العميل",

};



type PageProps = {

  params: Promise<{ id: string }>;

};
