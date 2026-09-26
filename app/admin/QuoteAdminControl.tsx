"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type CatalogCategory = {
  id: string;
  name: string;
};

type CatalogPart = {
  id: string;
  service_catalog_item_id: string;
  name: string;
  default_price: number;
};

export type RequestedPart = {
  id?: string | null;
  name: string;
  price?: number;
  quantity?: number;
};

export type ChangeRequestItem = {
  id: string;
  item_type:
    | "service"
    | "part"
    | "other";
  catalog_service_id: string | null;
  catalog_part_id: string | null;
  item_name: string;
  quantity: number;
  gross_unit_price: number;
};

type QuoteLine = {
  key: string;
  catalogServiceId: string | null;
  partId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  itemType:
    | "service"
    | "part"
    | "other";
};

function legacyQuoteLines(
  parts: RequestedPart[]
): QuoteLine[] {
  return parts
    .filter((part) =>
      part.name?.trim()
    )
    .map(
      (
        part,
        index
      ): QuoteLine => ({
        key: `requested-${index}-${part.id ?? "other"}`,
        catalogServiceId: null,
        partId: part.id ?? null,
        description:
          part.name.trim(),
        quantity: Math.max(
          1,
          Number(
            part.quantity
          ) || 1
        ),
        unitPrice: Math.max(
          0,
          Number(part.price) || 0
        ),
        itemType: part.id
          ? "part"
          : "other",
      })
    );
}

function changeRequestQuoteLines(
  items: ChangeRequestItem[]
): QuoteLine[] {
  return items.map(
    (item): QuoteLine => ({
      key: `change-${item.id}`,
      catalogServiceId:
        item.catalog_service_id ??
        null,
      partId:
        item.catalog_part_id ??
        null,
      description:
        item.item_name,
      quantity: Math.max(
        1,
        Number(item.quantity) || 1
      ),
      unitPrice: Math.max(
        0,
        Number(
          item.gross_unit_price
        ) || 0
      ),
      itemType:
        item.item_type,
    })
  );
}

function initialQuoteLines(
  changeRequestItems: ChangeRequestItem[],
  requestedParts: RequestedPart[]
) {
  if (
    changeRequestItems.length >
    0
  ) {
    return changeRequestQuoteLines(
      changeRequestItems
    );
  }

  return legacyQuoteLines(
    requestedParts
  );
}

export default function QuoteAdminControl({
  requestId,
  stage,
  archived,
  serviceType,
  requestedParts,
  changeRequestItems,
  changeRequestNotes,
}: {
  requestId: string;
  stage: string;
  archived: boolean;
  serviceType: string;
  requestedParts: RequestedPart[];
  changeRequestItems: ChangeRequestItem[];
  changeRequestNotes?: string | null;
}) {
  const router = useRouter();

  const [
    description,
    setDescription,
  ] = useState(
    changeRequestNotes?.trim() ??
      ""
  );

  const [
    laborCost,
    setLaborCost,
  ] = useState("0");

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const [
    categories,
    setCategories,
  ] = useState<
    CatalogCategory[]
  >([]);

  const [
    catalogParts,
    setCatalogParts,
  ] = useState<
    CatalogPart[]
  >([]);

  const [
    serviceId,
    setServiceId,
  ] = useState("");

  const [
    partToAdd,
    setPartToAdd,
  ] = useState("");

  const [lines, setLines] =
    useState<QuoteLine[]>(() =>
      initialQuoteLines(
        changeRequestItems,
        requestedParts
      )
    );

  useEffect(() => {
    const db = createClient();

    Promise.all([
      db
        .from(
          "service_catalog_items"
        )
        .select("id,name")
        .is("parent_id", null)
        .eq("is_visible", true)
        .order("sort_order"),

      db
        .from(
          "service_catalog_parts"
        )
        .select(
          "id,service_catalog_item_id,name,default_price"
        )
        .eq("is_active", true)
        .order("sort_order"),
    ]).then(
      ([
        categoryResult,
        partResult,
      ]) => {
        const loadedCategories =
          (categoryResult.data ??
            []) as CatalogCategory[];

        setCategories(
          loadedCategories
        );

        setCatalogParts(
          (partResult.data ??
            []) as CatalogPart[]
        );

        setServiceId(
          loadedCategories.find(
            (category) =>
              category.name ===
              serviceType
          )?.id ?? ""
        );
      }
    );
  }, [serviceType]);

  const nonLaborTotal =
    useMemo(
      () =>
        lines.reduce(
          (
            sum,
            line
          ) =>
            sum +
            line.quantity *
              line.unitPrice,
          0
        ),
      [lines]
    );

  const total =
    nonLaborTotal +
    (Number(laborCost) ||
      0);

  const availableParts =
    catalogParts.filter(
      (part) =>
        part.service_catalog_item_id ===
          serviceId &&
        !lines.some(
          (line) =>
            line.partId ===
            part.id
        )
    );

  function addCatalogPart() {
    const part =
      catalogParts.find(
        (item) =>
          item.id ===
          partToAdd
      );

    if (!part) {
      return;
    }

    setLines(
      (current) => [
        ...current,
        {
          key:
            crypto.randomUUID(),
          catalogServiceId:
            null,
          partId: part.id,
          description:
            part.name,
          quantity: 1,
          unitPrice: Number(
            part.default_price
          ),
          itemType: "part",
        },
      ]
    );

    setPartToAdd("");
  }

  function addOtherPart() {
    setLines(
      (current) => [
        ...current,
        {
          key:
            crypto.randomUUID(),
          catalogServiceId:
            null,
          partId: null,
          description: "",
          quantity: 1,
          unitPrice: 0,
          itemType: "other",
        },
      ]
    );
  }

  function updateLine(
    key: string,
    patch: Partial<QuoteLine>
  ) {
    setLines(
      (current) =>
        current.map(
          (line) =>
            line.key === key
              ? {
                  ...line,
                  ...patch,
                }
              : line
        )
    );
  }

  async function submitQuote() {
    if (
      !description.trim() ||
      lines.some(
        (line) =>
          !line.description.trim() ||
          line.quantity <= 0 ||
          line.unitPrice < 0
      ) ||
      Number(laborCost) < 0
    ) {
      setError(
        "أكمل وصف الإصلاح وأسماء البنود والكميات والأسعار."
      );
      return;
    }

    setBusy(true);
    setError("");

    const quoteLines = [
      ...lines.map(
        (line) => ({
          item_type:
            line.itemType,
          description:
            line.description.trim(),
          quantity:
            line.quantity,
          unit_price:
            line.unitPrice,
          catalog_part_id:
            line.partId,
          catalog_service_id:
            line.catalogServiceId,
        })
      ),

      {
        item_type: "labor",
        description:
          "أجرة العمل",
        quantity: 1,
        unit_price:
          Number(
            laborCost
          ) || 0,
        catalog_part_id: null,
        catalog_service_id:
          null,
      },
    ];

    const {
      error: resultError,
    } = await createClient().rpc(
      "admin_submit_service_request_quote",
      {
        target_service_request_id:
          requestId,
        quote_description:
          description.trim(),
        quote_line_items:
          quoteLines,
      }
    );

    setBusy(false);

    if (resultError) {
      console.error(
        "Quote submission failed",
        resultError
      );

      setError(
        "تعذر إرسال العرض. تحقق من البنود ومرحلة الطلب ثم حاول مجددًا."
      );

      return;
    }

    router.refresh();
  }

  async function setArchive(
    shouldArchive: boolean
  ) {
    setBusy(true);
    setError("");

    const {
      error: resultError,
    } = await createClient().rpc(
      "admin_set_service_request_archive",
      {
        target_service_request_id:
          requestId,
        should_archive:
          shouldArchive,
      }
    );

    setBusy(false);

    if (resultError) {
      setError(
        "تعذر تحديث الأرشفة."
      );
      return;
    }

    router.refresh();
  }

  const closed = [
    "completed",
    "customer_rejected",
    "customer_cancelled",
    "cancelled",
  ].includes(stage);

  return (
    <div className="technicianResponseControl">
      {stage ===
      "awaiting_admin_quote" ? (
        <>
          {changeRequestItems.length >
          0 ? (
            <div className="detailMuted">
              تم تحميل البنود التي
              أرسلها الفني تلقائيًا.
              راجعها وعدّل الأسعار
              عند الحاجة قبل إرسال
              العرض للعميل.
            </div>
          ) : null}

          <label>
            وصف الإصلاح
            <input
              value={
                description
              }
              onChange={(
                event
              ) =>
                setDescription(
                  event.target
                    .value
                )
              }
            />
          </label>

          <label>
            تصنيف الخدمة
            <select
              value={serviceId}
              onChange={(
                event
              ) => {
                setServiceId(
                  event.target
                    .value
                );
                setPartToAdd(
                  ""
                );
              }}
            >
              <option value="">
                اختر الخدمة
              </option>

              {categories.map(
                (item) => (
                  <option
                    key={
                      item.id
                    }
                    value={
                      item.id
                    }
                  >
                    {
                      item.name
                    }
                  </option>
                )
              )}
            </select>
          </label>

          <div className="quotePartPicker">
            <select
              value={
                partToAdd
              }
              onChange={(
                event
              ) =>
                setPartToAdd(
                  event.target
                    .value
                )
              }
              disabled={
                !serviceId
              }
            >
              <option value="">
                اختر قطعة
                لإضافتها
              </option>

              {availableParts.map(
                (item) => (
                  <option
                    key={
                      item.id
                    }
                    value={
                      item.id
                    }
                  >
                    {
                      item.name
                    }{" "}
                    —{" "}
                    {
                      item.default_price
                    }{" "}
                    ر.س
                  </option>
                )
              )}
            </select>

            <button
              type="button"
              className="button secondary compactButton"
              onClick={
                addCatalogPart
              }
              disabled={
                !partToAdd
              }
            >
              إضافة
            </button>
          </div>

          <div className="quoteLines">
            {lines.map(
              (line) => (
                <div
                  className="quoteLine"
                  key={
                    line.key
                  }
                >
                  <span>
                    {line.itemType ===
                    "service"
                      ? "خدمة"
                      : line.itemType ===
                          "part"
                        ? "قطعة"
                        : "أخرى"}
                  </span>

                  <input
                    aria-label="اسم البند"
                    value={
                      line.description
                    }
                    readOnly={
                      Boolean(
                        line.partId
                      ) ||
                      Boolean(
                        line.catalogServiceId
                      )
                    }
                    placeholder="اسم البند"
                    onChange={(
                      event
                    ) =>
                      updateLine(
                        line.key,
                        {
                          description:
                            event
                              .target
                              .value,
                        }
                      )
                    }
                  />

                  <input
                    aria-label="الكمية"
                    type="number"
                    min="1"
                    step="1"
                    value={
                      line.quantity
                    }
                    onChange={(
                      event
                    ) =>
                      updateLine(
                        line.key,
                        {
                          quantity:
                            Math.max(
                              1,
                              Number(
                                event
                                  .target
                                  .value
                              ) ||
                                1
                            ),
                        }
                      )
                    }
                  />

                  <input
                    aria-label="سعر الوحدة"
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      line.unitPrice
                    }
                    onChange={(
                      event
                    ) =>
                      updateLine(
                        line.key,
                        {
                          unitPrice:
                            Math.max(
                              0,
                              Number(
                                event
                                  .target
                                  .value
                              ) ||
                                0
                            ),
                        }
                      )
                    }
                  />

                  <button
                    type="button"
                    className="button secondary compactButton"
                    onClick={() =>
                      setLines(
                        (
                          current
                        ) =>
                          current.filter(
                            (
                              item
                            ) =>
                              item.key !==
                              line.key
                          )
                      )
                    }
                  >
                    حذف
                  </button>
                </div>
              )
            )}
          </div>

          <button
            type="button"
            className="button secondary compactButton"
            onClick={
              addOtherPart
            }
          >
            ＋ بند آخر
          </button>

          <label>
            تكلفة العمل
            <input
              type="number"
              min="0"
              step="0.01"
              value={
                laborCost
              }
              onChange={(
                event
              ) =>
                setLaborCost(
                  event.target
                    .value
                )
              }
            />
          </label>

          <p className="quoteTotal">
            الخدمات والقطع:{" "}
            {nonLaborTotal.toFixed(
              2
            )}{" "}
            ر.س · الإجمالي:{" "}
            <strong>
              {total.toFixed(
                2
              )}{" "}
              ر.س
            </strong>
          </p>

          <button
            type="button"
            className="button primary compactButton"
            disabled={
              busy ||
              !description.trim()
            }
            onClick={
              submitQuote
            }
          >
            {busy
              ? "جارٍ الإرسال..."
              : "إرسال العرض للعميل"}
          </button>
        </>
      ) : null}

      {closed ? (
        <button
          type="button"
          className="button secondary compactButton"
          disabled={busy}
          onClick={() =>
            setArchive(
              !archived
            )
          }
        >
          {archived
            ? "إعادة من الأرشيف"
            : "أرشفة الطلب"}
        </button>
      ) : null}

      {error ? (
        <p
          className="form-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}