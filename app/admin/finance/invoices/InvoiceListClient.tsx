"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type InvoiceRow = {
  id: string;
  invoice_number: number;
  customer_name: string;
  customer_email: string;
  total: number;
  paid: number;
  remaining: number;
  date: string;
  status_key:
    | "draft"
    | "unpaid"
    | "partial"
    | "paid"
    | "void";
  status_label: string;
};

const filters = [
  { key: "all", label: "الكل" },
  { key: "draft", label: "مسودة" },
  { key: "unpaid", label: "غير مدفوعة" },
  { key: "partial", label: "مدفوعة جزئيًا" },
  { key: "paid", label: "مدفوعة" },
  { key: "void", label: "ملغاة" },
];

export default function InvoiceListClient({
  invoices,
}: {
  invoices: InvoiceRow[];
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const money = (value: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
    }).format(Number(value));

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const matchesFilter =
        filter === "all" || invoice.status_key === filter;

      const matchesSearch =
        !query ||
        String(invoice.invoice_number).includes(query) ||
        invoice.customer_name.toLowerCase().includes(query) ||
        invoice.customer_email.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [invoices, search, filter]);

  return (
    <>
      <div className="financeInvoiceTools">
        <div className="financeInvoiceSearch">
          <label htmlFor="invoice-search">
            البحث
          </label>

          <input
            id="invoice-search"
            type="search"
            placeholder="رقم الفاتورة أو اسم العميل أو البريد"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </div>

        <div
          className="financeInvoiceFilters"
          aria-label="فلترة الفواتير"
        >
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              className={
                filter === item.key ? "active" : ""
              }
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="financeInvoiceResultCount">
        النتائج:{" "}
        <strong>{filteredInvoices.length}</strong>
      </div>

      {filteredInvoices.length ? (
        <div className="financeTableWrap">
          <table className="financeTable">
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
                <th>العميل</th>
                <th>الحالة</th>
                <th>الإجمالي</th>
                <th>المحصّل</th>
                <th>المتبقي</th>
                <th>التاريخ</th>
                <th>الإجراء</th>
              </tr>
            </thead>

            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <strong>
                      #{invoice.invoice_number}
                    </strong>
                  </td>

                  <td>
                    <strong>
                      {invoice.customer_name}
                    </strong>

                    <small>
                      {invoice.customer_email || "—"}
                    </small>
                  </td>

                  <td>
                    <span
                      className={`financeInvoiceStatus financeInvoiceStatus-${invoice.status_key}`}
                    >
                      {invoice.status_label}
                    </span>
                  </td>

                  <td>{money(invoice.total)}</td>

                  <td>{money(invoice.paid)}</td>

                  <td>{money(invoice.remaining)}</td>

                  <td>{invoice.date}</td>

                  <td>
                    <Link
                      className="button secondary compactButton"
                      href={`/admin/finance/invoices/${invoice.id}`}
                    >
                      فتح
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="financeInvoiceEmpty">
          لا توجد فواتير مطابقة للبحث أو الفلتر.
        </div>
      )}
    </>
  );
}