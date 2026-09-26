"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Line = { description: string; quantity: string; unitPrice: string; warrantyDays: string; warrantyTerms: string };
type StoredLine = { description: string; quantity: number; unit_price: number; warranty_days: number; warranty_terms: string };

export default function InvoiceDraftEditor({ invoiceId, status, initialWorkSummary, initialLines }: {
  invoiceId: string; status: string; initialWorkSummary: string; initialLines: StoredLine[];
}) {
  const router = useRouter();
  const [workSummary, setWorkSummary] = useState(initialWorkSummary);
  const [lines, setLines] = useState<Line[]>(initialLines.length ? initialLines.map(line => ({ description: line.description, quantity: String(line.quantity), unitPrice: String(line.unit_price), warrantyDays: String(line.warranty_days || 0), warrantyTerms: line.warranty_terms || "" })) : [{ description: "", quantity: "1", unitPrice: "", warrantyDays: "0", warrantyTerms: "" }]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const editable = status === "draft";
  const total = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0), [lines]);

  const updateLine = (index: number, patch: Partial<Line>) => setLines(current => current.map((line, currentIndex) => currentIndex === index ? { ...line, ...patch } : line));
  const addLine = () => setLines(current => [...current, { description: "", quantity: "1", unitPrice: "", warrantyDays: "0", warrantyTerms: "" }]);
  const removeLine = (index: number) => setLines(current => current.length === 1 ? current : current.filter((_, currentIndex) => currentIndex !== index));

  async function save(issue = false) {
    if (!workSummary.trim() || lines.some(line => !line.description.trim() || Number(line.quantity) <= 0 || Number(line.unitPrice) < 0 || line.unitPrice === "" || Number(line.warrantyDays) < 0 || Number(line.warrantyDays) > 3650)) {
      setMessage("أكمل وصف العمل وبنود الفاتورة والكميات والأسعار.");
      return;
    }
    setBusy(true); setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("finance_update_invoice_draft", {
      p_invoice_id: invoiceId,
      p_work_summary: workSummary.trim(),
      p_lines: lines.map(line => ({ description: line.description.trim(), quantity: Number(line.quantity), unit_price: Number(line.unitPrice), warranty_days: Number(line.warrantyDays) || 0, warranty_terms: line.warrantyTerms.trim() })),
    });
    if (error) { setBusy(false); setMessage("تعذر حفظ المسودة. راجع البيانات وحاول مجددًا."); return; }
    if (issue) {
      const { error: issueError } = await supabase.rpc("finance_set_invoice_status", { p_invoice_id: invoiceId, p_status: "issued" });
      setBusy(false);
      if (issueError) {
        console.error("Invoice issue failed", issueError);
        const details = issueError.message.includes("tax_invoicing_integration_required")
          ? "المنشأة محددة كمسجلة في ضريبة القيمة المضافة، والإصدار الضريبي الإلكتروني غير مفعّل بعد. بقيت الفاتورة مسودة لحمايتك من إصدار مستند غير متوافق."
          : issueError.message.includes("invoice_lines_required")
            ? "أضف بندًا واحدًا على الأقل قبل الإصدار."
            : issueError.message.includes("invoice_not_draft")
              ? "هذه الفاتورة لم تعد مسودة قابلة للإصدار. حدّث الصفحة لمراجعة حالتها."
              : "راجع بيانات المنشأة وحالة الفاتورة ثم حاول مجددًا.";
        setMessage(`حُفظت المسودة، لكن تعذر الإصدار. ${details}`);
        return;
      }
      setMessage("أُصدرت الفاتورة. يمكنك طباعتها أو إرسالها من صفحة المالية.");
    } else {
      setBusy(false); setMessage("حُفظت المسودة.");
    }
    router.refresh();
  }

  return <section className="card financePanel">
    <h2>{editable ? "مراجعة مسودة الفاتورة" : "بنود الفاتورة"}</h2>
    <p>{editable ? "راجع العمل المنجز، أضف البنود والأسعار، ثم احفظ أو أصدر الفاتورة." : "الفاتورة صادرة ولا يمكن تعديلها."}</p>
    <label>العمل المنجز<textarea value={workSummary} onChange={event => setWorkSummary(event.target.value)} disabled={!editable || busy} rows={4} /></label>
    <div className="financeLineItems">
      <div className="financeLineHeader"><strong>بنود الفاتورة</strong><strong>الإجمالي: {new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(total)}</strong></div>
      {lines.map((line, index) => <div className="financeLineRow" key={index}>
        <input aria-label={`وصف البند ${index + 1}`} value={line.description} onChange={event => updateLine(index, { description: event.target.value })} placeholder="وصف البند" disabled={!editable || busy} />
        <input aria-label={`كمية البند ${index + 1}`} type="number" min="0.01" step="0.01" value={line.quantity} onChange={event => updateLine(index, { quantity: event.target.value })} placeholder="الكمية" disabled={!editable || busy} />
        <input aria-label={`سعر البند ${index + 1}`} type="number" min="0" step="0.01" value={line.unitPrice} onChange={event => updateLine(index, { unitPrice: event.target.value })} placeholder="السعر" disabled={!editable || busy} />
        <input aria-label={`مدة ضمان البند ${index + 1} بالأيام`} type="number" min="0" max="3650" step="1" value={line.warrantyDays} onChange={event => updateLine(index, { warrantyDays: event.target.value })} placeholder="الضمان بالأيام" disabled={!editable || busy} />
        <input aria-label={`شروط ضمان البند ${index + 1}`} value={line.warrantyTerms} onChange={event => updateLine(index, { warrantyTerms: event.target.value })} placeholder="شروط الضمان (اختياري)" disabled={!editable || busy || Number(line.warrantyDays) === 0} />
        {editable ? <button type="button" className="button secondary compactButton" onClick={() => removeLine(index)} disabled={busy || lines.length === 1}>حذف</button> : null}
      </div>)}
    </div>
    {editable ? <div className="filterActions"><button type="button" className="button secondary compactButton" onClick={addLine} disabled={busy}>إضافة بند</button><button type="button" className="button secondary compactButton" onClick={() => void save(false)} disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ المسودة"}</button><button type="button" className="button primary compactButton" onClick={() => void save(true)} disabled={busy}>اعتماد وإصدار الفاتورة</button></div> : null}
    {message ? <p className="formMessage" role="status">{message}</p> : null}
  </section>;
}

