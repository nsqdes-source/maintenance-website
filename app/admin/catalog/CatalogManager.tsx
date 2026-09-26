"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Item = {
  id: string;
  service_key: string;
  name: string;
  description: string;
  price_from: number | null;
  pricing_mode: "fixed" | "from" | "inspection";
  is_visible: boolean;
  sort_order: number;
  parent_id: string | null;
};

type Service = {
  id: string;
  service_catalog_item_id: string;
  name: string;
  description: string;
  net_price: number;
  tax_rate: number;
  gross_price: number;
  is_visit_service: boolean;
  is_active: boolean;
  sort_order: number;
};

type Part = {
  id: string;
  service_catalog_item_id: string;
  name: string;
  default_price: number;
  tax_rate: number;
  gross_price: number;
  is_active: boolean;
  sort_order: number;
};

export default function CatalogManager({
  initialItems,
  initialServices,
  initialParts,
}: {
  initialItems: Item[];
  initialServices: Service[];
  initialParts: Part[];
}) {
  const [items, setItems] = useState(initialItems);
  const [services, setServices] = useState(initialServices);
  const [parts, setParts] = useState(initialParts);

  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success"
  );

  const [serviceFilter, setServiceFilter] = useState("");
  const [partFilter, setPartFilter] = useState("");

  const main = items.filter((item) => !item.parent_id);

  const filteredServices = serviceFilter
    ? services.filter(
        (service) => service.service_catalog_item_id === serviceFilter
      )
    : services;

  const filteredParts = partFilter
    ? parts.filter((part) => part.service_catalog_item_id === partFilter)
    : parts;

  const patchItem = (id: string, update: Partial<Item>) =>
    setItems((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...update } : row))
    );

  const patchService = (id: string, update: Partial<Service>) =>
    setServices((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...update } : row))
    );

  const patchPart = (id: string, update: Partial<Part>) =>
    setParts((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...update } : row))
    );

  function categoryName(id: string) {
    return items.find((item) => item.id === id)?.name || "—";
  }

  function grossPreview(service: Service) {
    const net = Number(service.net_price) || 0;
    const taxRate = Number(service.tax_rate) || 0;

    return net + net * (taxRate / 100);
  }

  function partGrossPreview(part: Part) {
    const net = Number(part.default_price) || 0;
    const taxRate = Number(part.tax_rate) || 0;

    return net + net * (taxRate / 100);
  }

  async function save() {
    setBusy(true);
    setMessage("");

    const db = createClient();
    const failures: string[] = [];

    for (const item of items) {
      const { error } = await db
        .from("service_catalog_items")
        .update({
          name: item.name.trim(),
          description: item.description.trim(),
          price_from: item.price_from,
          pricing_mode: item.pricing_mode,
          is_visible: item.is_visible,
          sort_order: item.sort_order,
          parent_id: item.parent_id,
        })
        .eq("id", item.id);

      if (error) {
        console.error("Catalog item save failed", {
          id: item.id,
          error,
        });

        failures.push(`التصنيف «${item.name || "بلا اسم"}»`);
      }
    }

    for (const service of services) {
      const { data, error } = await db
        .from("service_catalog_services")
        .update({
          service_catalog_item_id: service.service_catalog_item_id,
          name: service.name.trim(),
          description: service.description.trim(),
          net_price: Number(service.net_price) || 0,
          is_visit_service: service.is_visit_service,
          is_active: service.is_active,
          sort_order: service.sort_order,
        })
        .eq("id", service.id)
        .select(
          "id,service_catalog_item_id,name,description,net_price,tax_rate,gross_price,is_visit_service,is_active,sort_order"
        )
        .single();

      if (error || !data) {
        console.error("Priced catalog service save failed", {
          id: service.id,
          error,
        });

        failures.push(`الخدمة المسعّرة «${service.name || "بلا اسم"}»`);
      } else {
        setServices((rows) =>
          rows.map((row) =>
            row.id === service.id ? (data as Service) : row
          )
        );
      }
    }

    for (const part of parts) {
      const { data, error } = await db
        .from("service_catalog_parts")
        .update({
          service_catalog_item_id: part.service_catalog_item_id,
          name: part.name.trim(),
          default_price: Number(part.default_price) || 0,
          is_active: part.is_active,
          sort_order: part.sort_order,
        })
        .eq("id", part.id)
        .select(
          "id,service_catalog_item_id,name,default_price,tax_rate,gross_price,is_active,sort_order"
        )
        .single();

      if (error || !data) {
        console.error("Catalog part save failed", {
          id: part.id,
          error,
        });

        failures.push(`القطعة «${part.name || "بلا اسم"}»`);
      } else {
        setParts((rows) =>
          rows.map((row) =>
            row.id === part.id ? (data as Part) : row
          )
        );
      }
    }

    setBusy(false);
    setEditing(null);

    setMessageType(failures.length ? "error" : "success");

    setMessage(
      failures.length
        ? `لم تُحفظ العناصر التالية: ${failures.join(
            "، "
          )}. لم تتأثر بقية العناصر.`
        : "تم حفظ جميع تغييرات الكتالوج."
    );
  }

  async function addCategory() {
    setMessage("");

    const { data, error } = await createClient()
      .from("service_catalog_items")
      .insert({
        service_key: `service-${crypto.randomUUID()}`,
        name: "تصنيف جديد",
        description: "",
        pricing_mode: "inspection",
        sort_order: items.length,
      })
      .select()
      .single();

    if (error || !data) {
      console.error("Catalog category insert failed", error);

      setMessageType("error");
      setMessage(
        "تعذر إضافة التصنيف. تحقق من صلاحية الحساب ومن عدم تكرار البيانات."
      );
      return;
    }

    setItems((current) => [...current, data as Item]);
    setEditing(data.id);
  }

  async function addPricedService() {
    const category = main[0];

    if (!category) {
      setMessageType("error");
      setMessage("أضف تصنيف خدمة رئيسيًا أولًا.");
      return;
    }

    setMessage("");

    const { data, error } = await createClient()
      .from("service_catalog_services")
      .insert({
        service_catalog_item_id: category.id,
        name: `خدمة جديدة ${services.length + 1}`,
        description: "",
        net_price: 0,
        is_visit_service: false,
        is_active: true,
        sort_order: services.length,
      })
      .select(
        "id,service_catalog_item_id,name,description,net_price,tax_rate,gross_price,is_visit_service,is_active,sort_order"
      )
      .single();

    if (error || !data) {
      console.error("Priced catalog service insert failed", error);

      setMessageType("error");
      setMessage(
        "تعذر إضافة الخدمة المسعّرة. تحقق من الصلاحيات وبيانات الكتالوج."
      );
      return;
    }

    setServices((current) => [...current, data as Service]);
    setEditing(data.id);
  }

  async function addPart() {
    const category = main[0];

    if (!category) {
      setMessageType("error");
      setMessage("أضف تصنيف خدمة رئيسيًا أولًا.");
      return;
    }

    setMessage("");

    const { data, error } = await createClient()
      .from("service_catalog_parts")
      .insert({
        service_catalog_item_id: category.id,
        name: "قطعة جديدة",
        default_price: 0,
        sort_order: parts.length,
      })
      .select(
        "id,service_catalog_item_id,name,default_price,tax_rate,gross_price,is_active,sort_order"
      )
      .single();

    if (error || !data) {
      console.error("Catalog part insert failed", error);

      setMessageType("error");
      setMessage(
        "تعذر إضافة القطعة. تحقق من صلاحية الحساب ومن ارتباطها بتصنيف صحيح."
      );
      return;
    }

    setParts((current) => [...current, data as Part]);
    setEditing(data.id);
  }

  async function remove(
    table:
      | "service_catalog_items"
      | "service_catalog_services"
      | "service_catalog_parts",
    id: string
  ) {
    if (!confirm("هل تريد الحذف نهائيًا؟")) {
      return;
    }

    setBusy(true);
    setMessage("");

    const { error } = await createClient()
      .from(table)
      .delete()
      .eq("id", id);

    setBusy(false);

    if (error) {
      console.error("Catalog delete failed", {
        table,
        id,
        error,
      });

      setMessageType("error");

      if (table === "service_catalog_items") {
        setMessage(
          "لا يمكن حذف تصنيف مرتبط بخدمات أو قطع. أوقفه بدلًا من ذلك."
        );
      } else if (table === "service_catalog_services") {
        setMessage(
          "تعذر حذف الخدمة لأنها مستخدمة أو لعدم توفر الصلاحية. يمكن إيقافها بدلًا من حذفها."
        );
      } else {
        setMessage(
          "تعذر حذف القطعة لأنها مستخدمة أو لعدم توفر الصلاحية."
        );
      }

      return;
    }

    if (table === "service_catalog_items") {
      setItems((current) => current.filter((row) => row.id !== id));
    }

    if (table === "service_catalog_services") {
      setServices((current) => current.filter((row) => row.id !== id));
    }

    if (table === "service_catalog_parts") {
      setParts((current) => current.filter((row) => row.id !== id));
    }

    setMessageType("success");
    setMessage("تم حذف العنصر.");
  }

  return (
    <section className="catalogSplit">
    <nav className="catalogNavigation" aria-label="التنقل داخل كتالوج الخدمة">
      <a href="#catalog-categories">تصنيف الخدمات</a>
      <a href="#catalog-services">الخدمات الفرعية</a>
      <a href="#catalog-parts">القطع</a>
    </nav>

      {/* التصنيفات الرئيسية */}
      <section className="catalogPane" id="catalog-categories">
        <div className="catalogPaneHeader">
          <div>
            <p className="eyebrow">التصنيفات الرئيسية</p>
            <h2>تصنيفات الخدمات</h2>
          </div>

          <button
            className="button secondary compactButton"
            type="button"
            onClick={() => void addCategory()}
            disabled={busy}
          >
            إضافة تصنيف
          </button>
        </div>

        <div className="catalogTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>التصنيف</th>
                <th>النوع</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {editing === item.id ? (
                      <input
                        value={item.name}
                        onChange={(event) =>
                          patchItem(item.id, {
                            name: event.target.value,
                          })
                        }
                      />
                    ) : (
                      <strong>{item.name}</strong>
                    )}
                  </td>

                  <td>
                    {editing === item.id ? (
                      <select
                        value={item.parent_id ?? ""}
                        onChange={(event) =>
                          patchItem(item.id, {
                            parent_id: event.target.value || null,
                          })
                        }
                      >
                        <option value="">رئيسية</option>

                        {main
                          .filter((row) => row.id !== item.id)
                          .map((row) => (
                            <option key={row.id} value={row.id}>
                              فرعية من {row.name}
                            </option>
                          ))}
                      </select>
                    ) : item.parent_id ? (
                      `فرعية من ${categoryName(item.parent_id)}`
                    ) : (
                      "رئيسية"
                    )}
                  </td>

                  <td>
                    <button
                      className="catalogStatus"
                      type="button"
                      onClick={() =>
                        patchItem(item.id, {
                          is_visible: !item.is_visible,
                        })
                      }
                    >
                      {item.is_visible ? "مفعلة" : "موقفة"}
                    </button>
                  </td>

                  <td className="catalogActions">
                    <button
                      type="button"
                      onClick={() =>
                        setEditing(
                          editing === item.id ? null : item.id
                        )
                      }
                    >
                      تعديل
                    </button>

                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        void remove("service_catalog_items", item.id)
                      }
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* الخدمات الفرعية المسعرة */}
      <section className="catalogPane" id="catalog-services">
        <div className="catalogPaneHeader">
          <div>
            <p className="eyebrow">الأسعار شاملة الضريبة للعميل</p>
            <h2>الخدمات الفرعية المسعّرة</h2>
          </div>

          <button
            className="button secondary compactButton"
            type="button"
            onClick={() => void addPricedService()}
            disabled={busy}
          >
            إضافة خدمة
          </button>
        </div>

        <label>
          تصفية حسب التصنيف الرئيسي
          <select
            value={serviceFilter}
            onChange={(event) =>
              setServiceFilter(event.target.value)
            }
          >
            <option value="">كل التصنيفات</option>

            {main.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <div className="catalogTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>الخدمة</th>
                <th>التصنيف</th>
                <th>قبل الضريبة</th>
                <th>الضريبة</th>
                <th>شامل الضريبة</th>
                <th>زيارة</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>

            <tbody>
              {filteredServices.map((service) => (
                <tr key={service.id}>
                  <td>
                    {editing === service.id ? (
                      <input
                        value={service.name}
                        onChange={(event) =>
                          patchService(service.id, {
                            name: event.target.value,
                          })
                        }
                      />
                    ) : (
                      <strong>{service.name}</strong>
                    )}
                  </td>

                  <td>
                    {editing === service.id ? (
                      <select
                        value={service.service_catalog_item_id}
                        onChange={(event) =>
                          patchService(service.id, {
                            service_catalog_item_id:
                              event.target.value,
                          })
                        }
                      >
                        {main.map((category) => (
                          <option
                            key={category.id}
                            value={category.id}
                          >
                            {category.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      categoryName(service.service_catalog_item_id)
                    )}
                  </td>

                  <td>
                    {editing === service.id ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={service.net_price}
                        onChange={(event) =>
                          patchService(service.id, {
                            net_price:
                              Number(event.target.value) || 0,
                          })
                        }
                      />
                    ) : (
                      `${Number(service.net_price).toFixed(2)} ر.س`
                    )}
                  </td>

                  <td>
                    {Number(service.tax_rate).toFixed(2)}%
                  </td>

                  <td>
                    <strong>
                      {editing === service.id
                        ? `${grossPreview(service).toFixed(2)} ر.س`
                        : `${Number(service.gross_price).toFixed(
                            2
                          )} ر.س`}
                    </strong>
                  </td>

                  <td>
                    <button
                      className="catalogStatus"
                      type="button"
                      onClick={() =>
                        patchService(service.id, {
                          is_visit_service:
                            !service.is_visit_service,
                        })
                      }
                    >
                      {service.is_visit_service ? "نعم" : "لا"}
                    </button>
                  </td>

                  <td>
                    <button
                      className="catalogStatus"
                      type="button"
                      onClick={() =>
                        patchService(service.id, {
                          is_active: !service.is_active,
                        })
                      }
                    >
                      {service.is_active ? "مفعلة" : "موقفة"}
                    </button>
                  </td>

                  <td className="catalogActions">
                    <button
                      type="button"
                      onClick={() =>
                        setEditing(
                          editing === service.id
                            ? null
                            : service.id
                        )
                      }
                    >
                      تعديل
                    </button>

                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        void remove(
                          "service_catalog_services",
                          service.id
                        )
                      }
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}

              {filteredServices.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    لا توجد خدمات فرعية مسعّرة حتى الآن.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* القطع */}
      <section className="catalogPane" id="catalog-parts">
        <div className="catalogPaneHeader">
          <div>
            <p className="eyebrow">الأسعار شاملة الضريبة للعميل</p>
            <h2>القطع والأسعار</h2>
          </div>

          <button
            className="button secondary compactButton"
            type="button"
            onClick={() => void addPart()}
            disabled={busy}
          >
            إضافة قطعة
          </button>
        </div>

        <label>
          تصفية حسب التصنيف الرئيسي
          <select
            value={partFilter}
            onChange={(event) => setPartFilter(event.target.value)}
          >
            <option value="">كل التصنيفات</option>

            {main.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <div className="catalogTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>القطعة</th>
                <th>التصنيف</th>
                <th>قبل الضريبة</th>
                <th>الضريبة</th>
                <th>شامل الضريبة</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>

            <tbody>
              {filteredParts.map((part) => (
                <tr key={part.id}>
                  <td>
                    {editing === part.id ? (
                      <input
                        value={part.name}
                        onChange={(event) =>
                          patchPart(part.id, {
                            name: event.target.value,
                          })
                        }
                      />
                    ) : (
                      <strong>{part.name}</strong>
                    )}
                  </td>

                  <td>
                    {editing === part.id ? (
                      <select
                        value={part.service_catalog_item_id}
                        onChange={(event) =>
                          patchPart(part.id, {
                            service_catalog_item_id:
                              event.target.value,
                          })
                        }
                      >
                        {main.map((category) => (
                          <option
                            key={category.id}
                            value={category.id}
                          >
                            {category.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      categoryName(part.service_catalog_item_id)
                    )}
                  </td>

                  <td>
                    {editing === part.id ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={part.default_price}
                        onChange={(event) =>
                          patchPart(part.id, {
                            default_price:
                              Number(event.target.value) || 0,
                          })
                        }
                      />
                    ) : (
                      `${Number(part.default_price).toFixed(2)} ر.س`
                    )}
                  </td>

                  <td>
                    {Number(part.tax_rate).toFixed(2)}%
                  </td>

                  <td>
                    <strong>
                      {editing === part.id
                        ? `${partGrossPreview(part).toFixed(2)} ر.س`
                        : `${Number(part.gross_price).toFixed(
                            2
                          )} ر.س`}
                    </strong>
                  </td>

                  <td>
                    <button
                      className="catalogStatus"
                      type="button"
                      onClick={() =>
                        patchPart(part.id, {
                          is_active: !part.is_active,
                        })
                      }
                    >
                      {part.is_active ? "مفعلة" : "موقفة"}
                    </button>
                  </td>

                  <td className="catalogActions">
                    <button
                      type="button"
                      onClick={() =>
                        setEditing(
                          editing === part.id ? null : part.id
                        )
                      }
                    >
                      تعديل
                    </button>

                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        void remove(
                          "service_catalog_parts",
                          part.id
                        )
                      }
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}

              {filteredParts.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    لا توجد قطع في الكتالوج حتى الآن.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="catalogSave">
        <button
          className="button primary"
          type="button"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "جارٍ الحفظ..." : "حفظ التغييرات"}
        </button>

        {message ? (
          <span
            className={
              messageType === "error"
                ? "inlineError"
                : "inlineSuccess"
            }
            role={messageType === "error" ? "alert" : "status"}
          >
            {message}
          </span>
        ) : null}
      </div>
    </section>
  );
}