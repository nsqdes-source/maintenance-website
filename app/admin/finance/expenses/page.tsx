import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExpensesClient from "./ExpensesClient";

export const dynamic = "force-dynamic";

const roles = new Set(["admin_manager", "super_admin"]);

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

export default async function FinanceExpensesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !roles.has(profile.role)) {
    redirect("/admin");
  }

  const [{ data: expenses }, { data: requests }] = await Promise.all([
    supabase
      .from("finance_expenses")
      .select(
        "id,category,description,amount,expense_date,payment_method,vendor_name,reference,notes,service_request_id,created_at,voided_at"
      )
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),

    supabase
      .from("service_requests")
      .select("id,customer_name,service_type")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const expenseRows = (expenses ?? []) as Expense[];
  const requestRows = (requests ?? []) as RequestRow[];

  const activeExpenses = expenseRows.filter(
    (expense) => !expense.voided_at
  );

  const totalExpenses = activeExpenses.reduce(
    (sum, expense) => sum + Number(expense.amount),
    0
  );

  const currentMonth = new Date().toISOString().slice(0, 7);

  const monthExpenses = activeExpenses
    .filter((expense) =>
      expense.expense_date.startsWith(currentMonth)
    )
    .reduce(
      (sum, expense) => sum + Number(expense.amount),
      0
    );

  const partsExpenses = activeExpenses
    .filter((expense) => expense.category === "parts")
    .reduce(
      (sum, expense) => sum + Number(expense.amount),
      0
    );

  return (
    <main className="adminPage financePortal">
      <div className="container adminContainer">
        <div className="adminTopbar">
          <div>
            <p className="eyebrow">الإدارة المالية</p>
            <h1>المصروفات</h1>
          </div>

          <Link
            className="button secondary"
            href="/admin/finance"
          >
            العودة للنظرة العامة
          </Link>
        </div>

        <ExpensesClient
          expenses={expenseRows}
          requests={requestRows}
          totalExpenses={totalExpenses}
          monthExpenses={monthExpenses}
          partsExpenses={partsExpenses}
        />
      </div>
    </main>
  );
}