import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RequestTechnicianControl from "@/app/admin/RequestTechnicianControl";
import WorkflowAdvanceControl from "@/app/admin/WorkflowAdvanceControl";
import QuoteAdminControl from "@/app/admin/QuoteAdminControl";
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

type TechnicianOption = {
  id: string;
  name: string;
  phone: string | null;
  serviceTypes: string[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Date(value).toLocaleString("ar-SA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventLabel(
  type: string,
  fromStage: string | null,
  toStage: string | null
) {
  if (type === "assignment_created") {
    return "تم إسناد الطلب لفني";
  }

  if (type === "assignment_reassigned") {
    return "أُعيد إسناد الطلب لفني آخر";
  }

  if (type === "assignment_status_changed") {
    return "تغير رد الفني على الإسناد";
  }

  if (type === "stage_changed") {
    return `تغيرت حالة الطلب من ${
      fromStage
        ? WORKFLOW_LABELS[fromStage] ?? fromStage
        : "—"
    } إلى ${
      toStage
        ? WORKFLOW_LABELS[toStage] ?? toStage
        : "—"
    }`;
  }

  return type;
}

export default async function AdminRequestDetailsPage({
  params,
}: PageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    !ADMIN_ROLES.has(profile.role)
  ) {
    redirect("/account");
  }

  const { id } = await params;

  const [
    { data: request, error: requestError },
    { data: technicians },
    { data: assignments },
  ] = await Promise.all([
    supabase
      .from("service_requests")
      .select(
        "id, customer_name, phone, customer_email, service_type, problem_description, city, address, latitude, longitude, status, workflow_stage, visit_outcome, visit_notes, requested_parts, created_at, workflow_updated_at, archived_at, confirmed_date, confirmed_time_period, appointment_notes, cancellation_reason"
      )
      .eq("id", id)
      .maybeSingle(),

    supabase
      .from("technicians")
      .select(
        "id, profile_id, service_types, is_active, profile:profiles(full_name, phone)"
      )
      .eq("is_active", true),

    supabase
      .from("service_request_assignments")
      .select(
        "id, technician_id, status, assigned_at, responded_at, notes"
      )
      .eq("service_request_id", id)
      .order("assigned_at", {
        ascending: false,
      }),
  ]);

  if (requestError || !request) {
    notFound();
  }

  const technicianOptions: TechnicianOption[] = (
    technicians ?? []
  ).map((technician) => {
    const profileData = Array.isArray(
      technician.profile
    )
      ? technician.profile[0]
      : technician.profile;

    return {
      id: technician.id,
      name:
        profileData?.full_name ||
        "فني بدون اسم",
      phone: profileData?.phone ?? null,
      serviceTypes:
        technician.service_types ?? [],
    };
  });

  const activeAssignment = (
    assignments ?? []
  ).find(
    (assignment) =>
      assignment.status === "pending" ||
      assignment.status === "accepted"
  );

  const latestAssignment =
    assignments?.[0];

  const assignmentMode = ![
    "awaiting_assignment",
    "assigned",
    "technician_accepted",
  ].includes(request.workflow_stage)
    ? "unavailable"
    : latestAssignment?.status === "rejected"
      ? "reassign"
      : latestAssignment?.status === "pending"
        ? "pending"
        : latestAssignment?.status ===
            "accepted"
          ? "accepted"
          : "initial";

  const assignedTechnician =
    activeAssignment
      ? technicianOptions.find(
          (technician) =>
            technician.id ===
            activeAssignment.technician_id
        )
      : null;

  const { data: requestItems } =
    await supabase
      .from("service_request_items")
      .select(
        "id,service_name,quantity,net_unit_price,tax_rate,gross_unit_price,gross_total,item_source,created_at"
      )
      .eq("service_request_id", id)
      .order("created_at", {
        ascending: true,
      });

const requestItemsTotal = (
  requestItems ?? []
).reduce(
  (total, item) =>
    total +
    Number(item.gross_total ?? 0),
  0
);

const { data: changeRequest } =
  await supabase
    .from(
      "service_request_change_requests"
    )
    .select(
      "id,status,notes,created_at"
    )
    .eq(
      "service_request_id",
      id
    )
    .eq("status", "submitted")
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

let changeRequestItems: {
  id: string;
  item_type:
    | "service"
    | "part"
    | "other";
  catalog_service_id:
    | string
    | null;
  catalog_part_id:
    | string
    | null;
  item_name: string;
  quantity: number;
  gross_unit_price: number;
}[] = [];

if (changeRequest?.id) {
  const { data: items } =
    await supabase
      .from(
        "service_request_change_items"
      )
      .select(
        "id,item_type,catalog_service_id,catalog_part_id,item_name,quantity,gross_unit_price"
      )
      .eq(
        "change_request_id",
        changeRequest.id
      )
      .order("created_at", {
        ascending: true,
      });

  changeRequestItems =
    (items ?? []) as typeof changeRequestItems;
}

const { data: quotes } =
  await supabase
      .from("service_request_quotes")
      .select(
        "id, description, parts_description, parts_cost, labor_cost, line_items, status, created_at, customer_notes"
      )
      .eq("service_request_id", id)
      .order("created_at", {
        ascending: false,
      });

  const { data: events } =
    await supabase
      .from("service_request_events")
      .select(
        "id,event_type,from_stage,to_stage,details,created_at,actor:profiles(full_name,role)"
      )
      .eq("service_request_id", id)
      .order("created_at", {
        ascending: false,
      });

  const hasLocation =
    Number.isFinite(request.latitude) &&
    Number.isFinite(request.longitude);

  const mapUrl = hasLocation
    ? `https://www.google.com/maps?q=${request.latitude},${request.longitude}`
    : null;

  return (
    <main className="adminPage">
      <div className="container adminContainer requestDetailPage">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">
              تفاصيل طلب الخدمة
            </p>

            <h1>
              طلب {request.id.slice(0, 8)}
            </h1>
          </div>

          <Link
            className="button secondary"
            href="/admin/requests"
          >
            العودة للطلبات
          </Link>
        </div>

        <section className="requestDetailGrid">
          <article className="card detailCard">
            <div className="detailCardHeader">
              <div>
                <p className="eyebrow">
                  الحالة الحالية
                </p>

                <span
                  className={`statusBadge status-${request.workflow_stage}`}
                >
                  {WORKFLOW_LABELS[
                    request.workflow_stage
                  ] ??
                    request.workflow_stage}
                </span>
              </div>

              <div className="detailDates">
                <span>تاريخ الطلب</span>

                <strong>
                  {formatDate(
                    request.created_at
                  )}
                </strong>
              </div>
            </div>

            <h2>بيانات العميل</h2>

            <div className="detailFields">
              <div>
                <span>الاسم</span>
                <strong>
                  {request.customer_name}
                </strong>
              </div>

              <div>
                <span>الجوال</span>

                <a
                  href={`tel:${request.phone}`}
                >
                  {request.phone}
                </a>
              </div>

              <div>
                <span>
                  البريد الإلكتروني
                </span>

                {request.customer_email ? (
                  <a
                    href={`mailto:${request.customer_email}`}
                  >
                    {request.customer_email}
                  </a>
                ) : (
                  <strong>—</strong>
                )}
              </div>

              <div>
                <span>المدينة</span>

                <strong>
                  {request.city}
                </strong>
              </div>
            </div>

            <h2>تفاصيل الخدمة</h2>

            <div className="detailFields">
              <div>
                <span>نوع الخدمة</span>

                <strong>
                  {request.service_type}
                </strong>
              </div>

              <div className="detailWide">
                <span>العنوان</span>

                <strong>
                  {request.address}
                </strong>
              </div>

              <div className="detailWide">
                <span>وصف المشكلة</span>

                <p>
                  {request.problem_description}
                </p>

                <RequestImages
                  requestId={request.id}
                  showDriveSync={
                    profile.role ===
                      "admin_manager" ||
                    profile.role ===
                      "super_admin"
                  }
                />
              </div>
            </div>

            <h2>
              الخدمات المطلوبة والأسعار
            </h2>

            {requestItems?.length ? (
              <div className="assignmentHistory">
                {requestItems.map(
                  (item) => (
                    <div
                      className="assignmentHistoryItem"
                      key={item.id}
                    >
                      <div>
                        <strong>
                          {item.service_name}
                        </strong>

                        <strong>
                          {Number(
                            item.gross_total
                          ).toFixed(2)}{" "}
                          ر.س
                        </strong>
                      </div>

                      <div>
                        <span>
                          الكمية:{" "}
                          {Number(
                            item.quantity
                          )}
                        </span>

                        <span>
                          سعر الوحدة قبل
                          الضريبة:{" "}
                          {Number(
                            item.net_unit_price
                          ).toFixed(2)}{" "}
                          ر.س
                        </span>

                        <span>
                          الضريبة:{" "}
                          {Number(
                            item.tax_rate
                          ).toFixed(2)}
                          %
                        </span>

                        <span>
                          سعر الوحدة شامل
                          الضريبة:{" "}
                          {Number(
                            item.gross_unit_price
                          ).toFixed(2)}{" "}
                          ر.س
                        </span>
                      </div>

                      <span>
                        المصدر:{" "}
                        {item.item_source ===
                        "customer_request"
                          ? "اختيار العميل"
                          : item.item_source ===
                              "technician_change"
                            ? "تعديل الفني"
                            : item.item_source ===
                                "admin_change"
                              ? "تعديل الإدارة"
                              : item.item_source}
                      </span>
                    </div>
                  )
                )}

                <div className="requestItemsTotal">
                  <span>
                    إجمالي الخدمات المطلوبة
                    شامل الضريبة
                  </span>

                  <strong>
                    {requestItemsTotal.toFixed(
                      2
                    )}{" "}
                    ر.س
                  </strong>
                </div>
              </div>
            ) : (
              <p className="detailMuted">
                لا توجد خدمات مسعرة محفوظة
                لهذا الطلب.
              </p>
            )}

            <h2>الموقع</h2>

            {hasLocation ? (
              <div className="locationSummary">
                <div>
                  <span>خط العرض</span>

                  <strong>
                    {request.latitude}
                  </strong>
                </div>

                <div>
                  <span>خط الطول</span>

                  <strong>
                    {request.longitude}
                  </strong>
                </div>

                <a
                  className="button secondary"
                  href={mapUrl!}
                  target="_blank"
                  rel="noreferrer"
                >
                  فتح الموقع في Google Maps
                </a>
              </div>
            ) : (
              <p className="detailMuted">
                لا توجد إحداثيات مسجلة لهذا
                الطلب.
              </p>
            )}
          </article>

          <aside className="detailSideColumn">
            <section className="card detailCard">
              <h2>الإسناد</h2>

              <WorkflowAdvanceControl
                requestId={request.id}
                stage={
                  request.workflow_stage
                }
              />

              <RequestWorkflowActions
                requestId={request.id}
                stage={
                  request.workflow_stage
                }
              />

              <RequestTechnicianControl
                requestId={request.id}
                serviceType={
                  request.service_type
                }
                technicians={
                  technicianOptions
                }
                mode={assignmentMode}
                previousTechnicianId={
                  latestAssignment?.status ===
                  "rejected"
                    ? latestAssignment.technician_id
                    : null
                }
              />

              {assignedTechnician ? (
                <div className="assignedTechnician">
                  <strong>
                    {
                      assignedTechnician.name
                    }
                  </strong>

                  {assignedTechnician.phone ? (
                    <a
                      href={`tel:${assignedTechnician.phone}`}
                    >
                      {
                        assignedTechnician.phone
                      }
                    </a>
                  ) : null}

                  <span>
                    {activeAssignment?.status ===
                    "accepted"
                      ? "الفني وافق على الإسناد"
                      : "الإسناد بانتظار رد الفني"}
                  </span>
                </div>
              ) : (
                <p className="detailMuted">
                  لم يتم إسناد فني حاليًا.
                </p>
              )}

              {request.confirmed_date ? (
                <div className="assignedTechnician">
                  <strong>
                    الموعد المؤكد
                  </strong>

                  <span>
                    {request.confirmed_date} ·{" "}
                    {request.confirmed_time_period ||
                      "—"}
                  </span>

                  {request.appointment_notes ? (
                    <span>
                      {
                        request.appointment_notes
                      }
                    </span>
                  ) : null}
                </div>
              ) : null}

              {request.cancellation_reason ? (
                <p className="detailMuted">
                  سبب الإلغاء:{" "}
                  {
                    request.cancellation_reason
                  }
                </p>
              ) : null}
            </section>

            <section className="card detailCard">
              <h2>
                النتيجة والقطع /
                التعديلات
              </h2>

              <QuoteAdminControl
                requestId={request.id}
                stage={
                  request.workflow_stage
                }
                archived={Boolean(
                  request.archived_at
                )}
                serviceType={
                  request.service_type
                }
                requestedParts={
                  Array.isArray(
                    request.requested_parts
                  )
                    ? (request.requested_parts as {
                        id?:
                          | string
                          | null;
                        name: string;
                        price?: number;
                        quantity?: number;
                      }[])
                    : []
                }
                changeRequestItems={
                  changeRequestItems
                }
                changeRequestNotes={
                  changeRequest?.notes ??
                  null
                }
              />

              <div className="detailFields singleColumn">
                <div>
                  <span>
                    نتيجة الزيارة
                  </span>

                  <strong>
                    {request.visit_outcome
                      ? WORKFLOW_LABELS[
                          request
                            .visit_outcome
                        ] ??
                        request.visit_outcome
                      : "لم تسجل بعد"}
                  </strong>
                </div>

                <div className="detailWide">
                  <span>
                    القطع / التعديلات
                    والملاحظات
                  </span>

                  <p
                    className={
                      request.visit_notes
                        ? ""
                        : "detailMuted"
                    }
                  >
                    {request.visit_notes ||
                      "لا توجد قطع أو تعديلات أو ملاحظات مسجلة بعد."}
                  </p>
                </div>

                <div>
                  <span>
                    آخر تحديث لسير العمل
                  </span>

                  <strong>
                    {formatDate(
                      request.workflow_updated_at
                    )}
                  </strong>
                </div>
              </div>
            </section>
          </aside>
        </section>

        <section className="card detailCard">
          <h2>عروض الإصلاح</h2>

          {quotes?.length ? (
            quotes.map((quote) => (
              <div
                className="assignmentHistoryItem"
                key={quote.id}
              >
                <strong>
                  {quote.description}
                </strong>

                <span>
                  {quote.parts_description ||
                    "—"}{" "}
                  ·{" "}
                  {Number(
                    quote.parts_cost
                  ) +
                    Number(
                      quote.labor_cost
                    )}{" "}
                  ر.س · {quote.status}
                </span>

                {quote.customer_notes ? (
                  <p>
                    {
                      quote.customer_notes
                    }
                  </p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="detailMuted">
              لا يوجد عرض بعد.
            </p>
          )}
        </section>

        <section className="card detailCard">
          <h2>
            الخط الزمني وسجل التدقيق
          </h2>

          {!events?.length ? (
            <p className="detailMuted">
              لا توجد أحداث مسجلة بعد.
            </p>
          ) : (
            <div className="assignmentHistory">
              {events.map((event) => {
                const actor = Array.isArray(
                  event.actor
                )
                  ? event.actor[0]
                  : event.actor;

                const details =
                  event.details &&
                  typeof event.details ===
                    "object" &&
                  !Array.isArray(
                    event.details
                  )
                    ? (event.details as {
                        reason?: string;
                        notes?: string;
                      })
                    : {};

                return (
                  <div
                    className="assignmentHistoryItem"
                    key={event.id}
                  >
                    <div>
                      <strong>
                        {eventLabel(
                          event.event_type,
                          event.from_stage,
                          event.to_stage
                        )}
                      </strong>

                      <span>
                        {formatDate(
                          event.created_at
                        )}
                      </span>
                    </div>

                    <span>
                      {actor?.full_name ||
                        "النظام"}
                    </span>

                    {details.reason ? (
                      <p>
                        السبب:{" "}
                        {details.reason}
                      </p>
                    ) : details.notes ? (
                      <p>
                        ملاحظات:{" "}
                        {details.notes}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card detailCard">
          <h2>سجل الإسناد</h2>

          {!assignments?.length ? (
            <p className="detailMuted">
              لا يوجد سجل إسناد لهذا الطلب.
            </p>
          ) : (
            <div className="assignmentHistory">
              {assignments.map(
                (assignment) => {
                  const technician =
                    technicianOptions.find(
                      (item) =>
                        item.id ===
                        assignment.technician_id
                    );

                  return (
                    <div
                      className="assignmentHistoryItem"
                      key={assignment.id}
                    >
                      <div>
                        <strong>
                          {technician?.name ||
                            "فني غير متاح حاليًا"}
                        </strong>

                        <span>
                          {ASSIGNMENT_LABELS[
                            assignment.status
                          ] ??
                            assignment.status}
                        </span>
                      </div>

                      <div>
                        <span>
                          أُسند:{" "}
                          {formatDate(
                            assignment.assigned_at
                          )}
                        </span>

                        <span>
                          الرد:{" "}
                          {formatDate(
                            assignment.responded_at
                          )}
                        </span>
                      </div>

                      {assignment.notes ? (
                        <p>
                          {
                            assignment.notes
                          }
                        </p>
                      ) : null}
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>

        <style>{`
          .requestDetailPage {
            padding-bottom: 48px;
          }

          .requestDetailGrid {
            display: grid;
            grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr);
            gap: 18px;
            align-items: start;
          }

          .detailSideColumn {
            display: grid;
            gap: 18px;
          }

          .detailCard {
            padding: 22px;
          }

          .detailCard h2 {
            margin: 24px 0 14px;
            font-size: 1.05rem;
          }

          .detailCard > h2:first-child {
            margin-top: 0;
          }

          .detailCardHeader {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: flex-start;
            padding-bottom: 18px;
            border-bottom: 1px solid rgba(0, 0, 0, 0.08);
          }

          .detailDates {
            display: grid;
            gap: 4px;
            text-align: left;
          }

          .detailDates span,
          .detailFields span,
          .locationSummary span {
            color: #6b7280;
            font-size: 0.84rem;
          }

          .detailFields {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
          }

          .detailFields > div {
            display: grid;
            gap: 5px;
            min-width: 0;
          }

          .detailFields a {
            color: inherit;
            text-decoration: underline;
          }

          .detailFields p {
            margin: 0;
            white-space: pre-wrap;
            line-height: 1.8;
          }

          .detailWide {
            grid-column: 1 / -1;
          }

          .singleColumn {
            grid-template-columns: 1fr;
          }

          .locationSummary {
            display: flex;
            flex-wrap: wrap;
            gap: 14px;
            align-items: end;
          }

          .locationSummary > div {
            display: grid;
            gap: 4px;
          }

          .detailMuted {
            color: #6b7280;
            margin: 0;
            line-height: 1.7;
          }

          .assignedTechnician {
            display: grid;
            gap: 5px;
            margin-top: 14px;
            padding-top: 14px;
            border-top: 1px solid rgba(0, 0, 0, 0.08);
          }

          .assignedTechnician a {
            color: inherit;
            text-decoration: underline;
          }

          .assignedTechnician span {
            color: #6b7280;
            font-size: 0.85rem;
          }

          .assignmentHistory {
            display: grid;
            gap: 10px;
          }

          .assignmentHistoryItem {
            padding: 14px;
            border: 1px solid rgba(0, 0, 0, 0.08);
            border-radius: 12px;
            display: grid;
            gap: 8px;
          }

          .assignmentHistoryItem > div {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
          }

          .assignmentHistoryItem span {
            color: #6b7280;
            font-size: 0.86rem;
          }

          .assignmentHistoryItem p {
            margin: 0;
            white-space: pre-wrap;
            line-height: 1.7;
          }

          .requestItemsTotal {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            padding: 14px;
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 12px;
            font-size: 0.95rem;
          }

          .requestItemsTotal strong {
            font-size: 1.05rem;
          }

          @media (max-width: 800px) {
            .requestDetailGrid {
              grid-template-columns: 1fr;
            }

            .detailFields {
              grid-template-columns: 1fr;
            }

            .detailWide {
              grid-column: auto;
            }

            .detailCardHeader {
              flex-direction: column;
            }

            .requestItemsTotal {
              align-items: flex-start;
              flex-direction: column;
            }
          }
        `}</style>
      </div>
    </main>
  );
}