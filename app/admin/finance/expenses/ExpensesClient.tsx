"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Expense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: string;
  vendor_name: string;
  reference: string;
  notes: string;
  service_request_id: string | null;
  created_at: string;
  voided_at: string | null;
};

type RequestRow = {
  id: string;
  customer_name: string;
  service_type: string;
};

const categories = [
  { value: "parts", label: "قطع غيار" },
  { value: "technician", label: "أجور فنيين" },
  { value: "transport", label: "نقل" },
  { value: "operations", label: "تشغيل" },
  { value: "tools", label: "أدوات" },
  { value: "marketing", label: "تسويق" },
  { value: "other", label: "أخرى" },
];

const paymentMethods = [
  { value: "bank_transfer", label: "تحويل بنكي" },
  { value: "cash", label: "نقدًا" },
  { value: "card", label: "بطاقة" },
  { value: "other", label: "أخرى" },
];

export default function ExpensesClient({
  expenses,
  requests,
  totalExpenses,
  monthExpenses,
  partsExpenses,
}: {
  expenses: Expense[];
  requests: RequestRow[];
  totalExpenses: number;
  monthExpenses: number;
  partsExpenses: number;
}) {
  const router = useRouter();

  const [category, setCategory] = useState("parts");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [paymentMethod, setPaymentMethod] =
    useState("bank_transfer");
  const [vendorName, setVendorName] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [requestId, setRequestId] = useState("");

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const money = (value: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
    }).format(Number(value));

  const categoryLabel = (value: string) =>
    categories.find((item) => item.value === value)?.label ||
    value;

  const paymentMethodLabel = (value: string) =>
    paymentMethods.find((item) => item.value === value)?.label ||
    value;

  const filteredExpenses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return expenses.filter((expense) => {
      const matchesCategory =
        filterCategory === "all" ||
        expense.category === filterCategory;

      const matchesSearch =
        !query ||
        expense.description.toLowerCase().includes(query) ||
        expense.vendor_name.toLowerCase().includes(query) ||
        expense.reference.toLowerCase().includes(query) ||
        expense.notes.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [expenses, search, filterCategory]);

  async function recordExpense() {
    if (!description.trim()) {
      setMessage("أدخل وصف المصروف.");
      return;
    }

    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      setMessage("أدخل مبلغًا صحيحًا.");
      return;
    }

    setBusy(true);
    setMessage("");

    const { error } = await createClient().rpc(
      "finance_record_expense",
      {
        p_category: category,
        p_description: description.trim(),
        p_amount: numericAmount,
        p_expense_date: expenseDate,
        p_payment_method: paymentMethod,
        p_vendor_name: vendorName.trim(),
        p_reference: reference.trim(),
        p_notes: notes.trim(),
        p_service_request_id: requestId || null,
      }
    );

    setBusy(false);

    if (error) {
      setMessage(
        `تعذر تسجيل المصروف: ${error.message}`
      );
      return;
    }

    setDescription("");
    setAmount("");
    setVendorName("");
    setReference("");
    setNotes("");
    setRequestId("");
    setMessage("تم تسجيل المصروف.");
    router.refresh();
  }

  async function voidExpense(id: string) {
    if (
      !window.confirm(
        "إلغاء قيد المصروف؟ سيبقى محفوظًا في السجل."
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage("");

    const { error } = await createClient().rpc(
      "finance_void_expense",
      {
        p_expense_id: id,
      }
    );

    setBusy(false);

    if (error) {
      setMessage(
        `تعذر إلغاء المصروف: ${error.message}`
      );
      return;
    }

    setMessage("تم إلغاء قيد المصروف.");
    router.refresh();
  }

  return (
    <>
      <div className="grid">
        <section className="card">
          <p className="eyebrow">
            إجمالي المصروفات الفعلية
          </p>
          <h2>{money(totalExpenses)}</h2>
        </section>

        <section className="card">
          <p className="eyebrow">
            مصروفات هذا الشهر
          </p>
          <h2>{money(monthExpenses)}</h2>
        </section>

        <section className="card">
          <p className="eyebrow">
            مصروفات قطع الغيار
          </p>
          <h2>{money(partsExpenses)}</h2>
        </section>
      </div>

      {message ? (
        <p className="formMessage" role="status">
          {message}
        </p>
      ) : null}

      <section className="card financePanel">
        <h2>تسجيل مصروف جديد</h2>

        <p>
          سجل المصروف الفعلي، ويمكن ربطه بطلب صيانة عند الحاجة.
        </p>

        <div className="financeGrid">
          <label>
            التصنيف
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value)
              }
            >
              {categories.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            وصف المصروف
            <input
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="مثال: شراء كمبروسر مكيف"
            />
          </label>

          <label>
            المبلغ
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value)
              }
            />
          </label>

          <label>
            تاريخ المصروف
            <input
              type="date"
              value={expenseDate}
              onChange={(event) =>
                setExpenseDate(event.target.value)
              }
            />
          </label>

          <label>
            طريقة الدفع
            <select
              value={paymentMethod}
              onChange={(event) =>
                setPaymentMethod(event.target.value)
              }
            >
              {paymentMethods.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            المورد / المستفيد
            <input
              value={vendorName}
              onChange={(event) =>
                setVendorName(event.target.value)
              }
              placeholder="اختياري"
            />
          </label>

          <label>
            المرجع
            <input
              value={reference}
              onChange={(event) =>
                setReference(event.target.value)
              }
              placeholder="رقم فاتورة المورد أو الحوالة"
            />
          </label>

          <label>
            ربط بطلب صيانة
            <select
              value={requestId}
              onChange={(event) =>
                setRequestId(event.target.value)
              }
            >
              <option value="">
                بدون ربط
              </option>

              {requests.map((request) => (
                <option
                  key={request.id}
                  value={request.id}
                >
                  {request.customer_name} ·{" "}
                  {request.service_type} ·{" "}
                  {request.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="financeExpenseNotes">
          ملاحظات
          <textarea
            rows={3}
            value={notes}
            onChange={(event) =>
              setNotes(event.target.value)
            }
            placeholder="تفاصيل إضافية اختيارية"
          />
        </label>

        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={recordExpense}
        >
          {busy
            ? "جارٍ الحفظ..."
            : "تسجيل المصروف"}
        </button>
      </section>

      <section className="card financePanel">
        <h2>سجل المصروفات</h2>

        <div className="financeExpenseTools">
          <div className="financeInvoiceSearch">
            <label htmlFor="expense-search">
              البحث
            </label>

            <input
              id="expense-search"
              type="search"
              placeholder="الوصف أو المورد أو المرجع"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>

          <label className="financeExpenseFilter">
            التصنيف
            <select
              value={filterCategory}
              onChange={(event) =>
                setFilterCategory(event.target.value)
              }
            >
              <option value="all">
                جميع التصنيفات
              </option>

              {categories.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filteredExpenses.length ? (
          <div className="financeTableWrap">
            <table className="financeTable">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>التصنيف</th>
                  <th>الوصف</th>
                  <th>المورد</th>
                  <th>المبلغ</th>
                  <th>الدفع</th>
                  <th>المرجع</th>
                  <th>الحالة</th>
                  <th>الإجراء</th>
                </tr>
              </thead>

              <tbody>
                {filteredExpenses.map(
                  (expense) => (
                    <tr key={expense.id}>
                      <td>
                        {new Date(
                          `${expense.expense_date}T00:00:00`
                        ).toLocaleDateString("ar-SA")}
                      </td>

                      <td>
                        {categoryLabel(
                          expense.category
                        )}
                      </td>

                      <td>
                        <strong>
                          {expense.description}
                        </strong>

                        {expense.notes ? (
                          <small>
                            {expense.notes}
                          </small>
                        ) : null}
                      </td>

                      <td>
                        {expense.vendor_name || "—"}
                      </td>

                      <td>
                        {money(expense.amount)}
                      </td>

                      <td>
                        {paymentMethodLabel(
                          expense.payment_method
                        )}
                      </td>

                      <td>
                        {expense.reference || "—"}
                      </td>

                      <td>
                        {expense.voided_at
                          ? "ملغي"
                          : "نشط"}
                      </td>

                      <td>
                        {!expense.voided_at ? (
                          <button
                            type="button"
                            className="button secondary compactButton"
                            disabled={busy}
                            onClick={() =>
                              voidExpense(expense.id)
                            }
                          >
                            إلغاء القيد
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p>لا توجد مصروفات مطابقة.</p>
        )}
      </section>
    </>
  );
}