"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/app/components/LocaleContext";

export default function CustomerQuoteDecision({ quote }: {
  quote: { id: string; description: string; parts_description: string | null; parts_cost: number; labor_cost: number; status: string };
}) {
  const locale = useLocale();
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(approve: boolean) {
    setBusy(true);
    setError("");
    const { error: resultError } = await createClient().rpc("customer_decide_service_request_quote", {
      target_quote_id: quote.id,
      approve,
      decision_notes: notes.trim() || null,
    });
    setBusy(false);
    if (resultError) { setError(t("تعذر تسجيل القرار. أعد تحميل الصفحة وحاول مجددًا.", "Could not save your decision. Reload and try again.")); return; }
    router.refresh();
  }

  return <div className="followupNotice">
    <strong>{t("عرض الإصلاح", "Repair quote")}</strong>
    <p>{quote.description}</p>
    {quote.parts_description ? <p>القطع والتعديلات: {quote.parts_description}</p> : null}
    <p>القطع: {Number(quote.parts_cost).toFixed(2)} ر.س · العمل: {Number(quote.labor_cost).toFixed(2)} ر.س</p>
    <strong>الإجمالي: {(Number(quote.parts_cost) + Number(quote.labor_cost)).toFixed(2)} ر.س</strong>
    <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("ملاحظاتك (اختياري)", "Your notes (optional)")} disabled={busy} />
    <div className="filterActions">
      <button type="button" className="button primary compactButton" disabled={busy} onClick={() => decide(true)}>{t("الموافقة على العرض", "Approve quote")}</button>
      <button type="button" className="button secondary compactButton" disabled={busy} onClick={() => decide(false)}>{t("رفض العرض", "Decline quote")}</button>
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>;
}
