"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Outcome =
  | "completed"
  | "needs_followup"
  | "reschedule_requested"
  | "unable_to_complete";

type CatalogRelation =
  | { name: string }
  | { name: string }[]
  | null;

type CatalogService = {
  id: string;
  service_catalog_item_id: string;
  name: string;
  gross_price: number;
  service_catalog_item?: CatalogRelation;
};

type CatalogPart = {
  id: string;
  service_catalog_item_id: string;
  name: string;
  default_price: number;
  tax_rate: number;
  gross_price: number;
  service_catalog_item?: CatalogRelation;
};

type ChangeLine = {
  key: string;
  itemType: "service" | "part" | "other";
  catalogId: string | null;
  name: string;
  quantity: number;
  displayPrice: number | null;
};

const outcomes: {
  value: Outcome;
  label: string;
}[] = [
  {
    value: "completed",
    label: "تم التنفيذ",
  },
  {
    value: "needs_followup",
    label: "قطع ومواد / تعديل",
  },
  {
    value: "reschedule_requested",
    label: "طلب إعادة جدولة",
  },
  {
    value: "unable_to_complete",
    label: "تعذر التنفيذ",
  },
];

function relationName(
  relation: CatalogRelation
) {
  if (!relation) {
    return "";
  }

  if (Array.isArray(relation)) {
    return relation[0]?.name ?? "";
  }

  return relation.name ?? "";
}

export default function VisitOutcomeControl({
  requestId,
  serviceType,
}: {
  requestId: string;
  serviceType: string;
}) {
  const router = useRouter();

  const [outcome, setOutcome] =
    useState<Outcome>("completed");

  const [notes, setNotes] = useState("");

  const [services, setServices] = useState<
    CatalogService[]
  >([]);

  const [parts, setParts] = useState<
    CatalogPart[]
  >([]);

  const [lines, setLines] = useState<
    ChangeLine[]
  >([]);

  const [serviceToAdd, setServiceToAdd] =
    useState("");

  const [partToAdd, setPartToAdd] =
    useState("");

  const [modal, setModal] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    const supabase = createClient();

    Promise.all([
      supabase
        .from("service_catalog_services")
        .select(
          "id,service_catalog_item_id,name,gross_price,service_catalog_item:service_catalog_items(name)"
        )
        .eq("is_active", true)
        .order("sort_order"),

      supabase
        .from("service_catalog_parts")
        .select(
          "id,service_catalog_item_id,name,default_price,tax_rate,gross_price,service_catalog_item:service_catalog_items(name)"
        )
        .eq("is_active", true)
        .order("sort_order"),
    ]).then(
      ([serviceResult, partResult]) => {
        if (serviceResult.error) {
          console.error(
            "Could not load catalog services",
            serviceResult.error
          );
        }

        if (partResult.error) {
          console.error(
            "Could not load catalog parts",
            partResult.error
          );
        }

        setServices(
          (serviceResult.data ??
            []) as CatalogService[]
        );

        setParts(
          (partResult.data ??
            []) as CatalogPart[]
        );
      }
    );
  }, []);

  const filteredServices =
    useMemo(() => {
      return services.filter((service) => {
        const categoryName =
          relationName(
            service.service_catalog_item
          );

        return (
          !serviceType ||
          categoryName === serviceType
        );
      });
    }, [services, serviceType]);

  const filteredParts = useMemo(() => {
    return parts.filter((part) => {
      const categoryName =
        relationName(
          part.service_catalog_item
        );

      return (
        !serviceType ||
        categoryName === serviceType
      );
    });
  }, [parts, serviceType]);

  const availableServices =
    filteredServices.filter(
      (service) =>
        !lines.some(
          (line) =>
            line.itemType ===
              "service" &&
            line.catalogId ===
              service.id
        )
    );

  const availableParts =
    filteredParts.filter(
      (part) =>
        !lines.some(
          (line) =>
            line.itemType ===
              "part" &&
            line.catalogId === part.id
        )
    );

  const visibleTotal = useMemo(
    () =>
      lines.reduce(
        (total, line) =>
          total +
          (line.displayPrice ?? 0) *
            line.quantity,
        0
      ),
    [lines]
  );

  function addService() {
    const service =
      services.find(
        (item) =>
          item.id === serviceToAdd
      );

    if (!service) {
      return;
    }

    if (
      lines.some(
        (line) =>
          line.itemType === "service" &&
          line.catalogId === service.id
      )
    ) {
      return;
    }

    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        itemType: "service",
        catalogId: service.id,
        name: service.name,
        quantity: 1,
        displayPrice: Number(
          service.gross_price ?? 0
        ),
      },
    ]);

    setServiceToAdd("");
  }

  function addPart() {
    const part = parts.find(
      (item) =>
        item.id === partToAdd
    );

    if (!part) {
      return;
    }

    if (
      lines.some(
        (line) =>
          line.itemType === "part" &&
          line.catalogId === part.id
      )
    ) {
      return;
    }

    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        itemType: "part",
        catalogId: part.id,
        name: part.name,
        quantity: 1,
        displayPrice: Number(
          part.gross_price ?? 0
        ),
      },
    ]);

    setPartToAdd("");
  }

  function addOther() {
    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        itemType: "other",
        catalogId: null,
        name: "",
        quantity: 1,
        displayPrice: null,
      },
    ]);
  }

  function patchLine(
    key: string,
    update: Partial<ChangeLine>
  ) {
    setLines((current) =>
      current.map((line) =>
        line.key === key
          ? {
              ...line,
              ...update,
            }
          : line
      )
    );
  }

  function removeLine(key: string) {
    setLines((current) =>
      current.filter(
        (line) => line.key !== key
      )
    );
  }

  function changeOutcome(
    value: Outcome
  ) {
    setOutcome(value);
    setError("");

    if (value === "needs_followup") {
      setModal(true);
    }
  }

  async function submitRegularOutcome() {
    setSaving(true);
    setError("");

    const { error: rpcError } =
      await createClient().rpc(
        "technician_record_visit_outcome",
        {
          target_service_request_id:
            requestId,
          new_outcome: outcome,
          outcome_notes:
            notes.trim() || null,
          selected_parts: [],
        }
      );

    setSaving(false);

    if (rpcError) {
      console.error(
        "Visit outcome failed",
        rpcError
      );

      setError(
        "تعذر حفظ نتيجة الزيارة."
      );

      return;
    }

    router.refresh();
  }

  async function submitChangeRequest() {
    if (!lines.length) {
      setError(
        "أضف خدمة أو قطعة أو بندًا آخر واحدًا على الأقل."
      );

      return;
    }

    if (
      lines.some(
        (line) =>
          line.quantity <= 0 ||
          (line.itemType === "other" &&
            !line.name.trim())
      )
    ) {
      setError(
        "راجع أسماء البنود والكميات قبل الإرسال."
      );

      return;
    }

    setSaving(true);
    setError("");

    const selectedItems =
      lines.map((line) => {
        if (
          line.itemType === "other"
        ) {
          return {
            item_type: "other",
            name: line.name.trim(),
            quantity: line.quantity,
          };
        }

        return {
          item_type: line.itemType,
          catalog_id: line.catalogId,
          quantity: line.quantity,
        };
      });

    const { error: rpcError } =
      await createClient().rpc(
        "technician_submit_change_request",
        {
          target_service_request_id:
            requestId,
          change_notes:
            notes.trim() || null,
          selected_items:
            selectedItems,
        }
      );

    setSaving(false);

    if (rpcError) {
      console.error(
        "Change request failed",
        rpcError
      );

      if (
        rpcError.message?.includes(
          "change_request_already_submitted"
        )
      ) {
        setError(
          "يوجد طلب تعديل سابق بانتظار مراجعة الإدارة."
        );
      } else if (
        rpcError.message?.includes(
          "duplicate_change_item"
        )
      ) {
        setError(
          "لا يمكن إضافة نفس الخدمة أو القطعة أكثر من مرة."
        );
      } else if (
        rpcError.message?.includes(
          "invalid_workflow_transition"
        )
      ) {
        setError(
          "حالة الطلب تغيرت ولم يعد من الممكن إرسال تعديل جديد."
        );
      } else {
        setError(
          "تعذر إرسال طلب التعديل إلى الإدارة."
        );
      }

      return;
    }

    setModal(false);
    setLines([]);
    setNotes("");
    setOutcome("completed");

    router.refresh();
  }

  return (
    <div className="technicianResponseControl">
      <select
        value={outcome}
        onChange={(event) =>
          changeOutcome(
            event.target.value as Outcome
          )
        }
      >
        {outcomes.map((item) => (
          <option
            key={item.value}
            value={item.value}
          >
            {item.label}
          </option>
        ))}
      </select>

      {outcome !==
      "needs_followup" ? (
        <>
          <textarea
            rows={2}
            value={notes}
            onChange={(event) =>
              setNotes(
                event.target.value
              )
            }
            placeholder="ملاحظات الزيارة (اختياري)"
          />

          <button
            type="button"
            className="button primary compactButton"
            disabled={saving}
            onClick={
              submitRegularOutcome
            }
          >
            {saving
              ? "جارٍ الحفظ..."
              : "تسجيل نتيجة الزيارة"}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="button primary compactButton"
          onClick={() =>
            setModal(true)
          }
        >
          تحديد الخدمات والقطع وإرسال التعديل
        </button>
      )}

      {modal ? (
        <div
          className="partsModalBackdrop"
          role="dialog"
          aria-modal="true"
        >
          <section className="partsModal">
            <div>
              <p className="eyebrow">
                طلب قطع أو تعديل
              </p>

              <h2>
                حدد الخدمات والقطع
                المطلوبة
              </h2>

              <p>
                الأسعار الظاهرة شاملة
                الضريبة. سيتم اعتماد
                السعر الفعلي من
                الكتالوج عند الإرسال.
              </p>
            </div>

            <div className="quotePartPicker">
              <select
                value={serviceToAdd}
                onChange={(event) =>
                  setServiceToAdd(
                    event.target.value
                  )
                }
              >
                <option value="">
                  إضافة خدمة من الكتالوج
                </option>

                {availableServices.map(
                  (service) => (
                    <option
                      key={service.id}
                      value={service.id}
                    >
                      {service.name} —{" "}
                      {Number(
                        service.gross_price
                      ).toFixed(2)}{" "}
                      ر.س
                    </option>
                  )
                )}
              </select>

              <button
                type="button"
                className="button secondary compactButton"
                disabled={
                  !serviceToAdd
                }
                onClick={addService}
              >
                إضافة خدمة
              </button>
            </div>

            <div className="quotePartPicker">
              <select
                value={partToAdd}
                onChange={(event) =>
                  setPartToAdd(
                    event.target.value
                  )
                }
              >
                <option value="">
                  إضافة قطعة من الكتالوج
                </option>

                {availableParts.map(
                  (part) => (
                    <option
                      key={part.id}
                      value={part.id}
                    >
                      {part.name} —{" "}
                      {Number(
                        part.gross_price
                      ).toFixed(2)}{" "}
                      ر.س
                    </option>
                  )
                )}
              </select>

              <button
                type="button"
                className="button secondary compactButton"
                disabled={!partToAdd}
                onClick={addPart}
              >
                إضافة قطعة
              </button>
            </div>

            {lines.length ? (
              <div className="quoteLines">
                {lines.map((line) => (
                  <div
                    className="quoteLine"
                    key={line.key}
                  >
                    <div>
                      <strong>
                        {line.itemType ===
                        "service"
                          ? "خدمة"
                          : line.itemType ===
                            "part"
                          ? "قطعة"
                          : "أخرى"}
                      </strong>

                      {line.itemType ===
                      "other" ? (
                        <input
                          aria-label="اسم البند"
                          value={
                            line.name
                          }
                          maxLength={160}
                          placeholder="اكتب اسم القطعة أو العمل المطلوب"
                          onChange={(
                            event
                          ) =>
                            patchLine(
                              line.key,
                              {
                                name: event
                                  .target
                                  .value,
                              }
                            )
                          }
                        />
                      ) : (
                        <span>
                          {line.name}
                        </span>
                      )}
                    </div>

                    <label>
                      العدد
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value={
                          line.quantity
                        }
                        onChange={(
                          event
                        ) =>
                          patchLine(
                            line.key,
                            {
                              quantity:
                                Math.min(
                                  100,
                                  Math.max(
                                    1,
                                    Number(
                                      event
                                        .target
                                        .value
                                    ) ||
                                      1
                                  )
                                ),
                            }
                          )
                        }
                      />
                    </label>

                    <span>
                      {line.displayPrice !==
                      null
                        ? `${line.displayPrice.toFixed(
                            2
                          )} ر.س للوحدة`
                        : "يحدد السعر من الإدارة"}
                    </span>

                    <button
                      type="button"
                      className="button secondary compactButton"
                      onClick={() =>
                        removeLine(
                          line.key
                        )
                      }
                    >
                      حذف
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              className="button secondary compactButton"
              onClick={addOther}
            >
              ＋ بند آخر غير موجود في
              الكتالوج
            </button>

            {lines.some(
              (line) =>
                line.displayPrice !==
                null
            ) ? (
              <p className="quoteTotal">
                إجمالي البنود المسعرة
                حاليًا:{" "}
                <strong>
                  {visibleTotal.toFixed(
                    2
                  )}{" "}
                  ر.س
                </strong>
              </p>
            ) : null}

            <textarea
              rows={3}
              value={notes}
              onChange={(event) =>
                setNotes(
                  event.target.value
                )
              }
              placeholder="ملاحظات للفريق أو المشرف (اختياري)"
            />

            {error ? (
              <span className="inlineError">
                {error}
              </span>
            ) : null}

            <div className="partsModalActions">
              <button
                type="button"
                className="button secondary"
                disabled={saving}
                onClick={() =>
                  setModal(false)
                }
              >
                إلغاء
              </button>

              <button
                type="button"
                className="button primary"
                disabled={
                  saving ||
                  !lines.length
                }
                onClick={
                  submitChangeRequest
                }
              >
                {saving
                  ? "جارٍ الإرسال..."
                  : "إرسال التعديل للإدارة"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}