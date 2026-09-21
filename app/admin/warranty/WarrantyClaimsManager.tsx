"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type WarrantyClaim = { id: string; description: string; status: string; admin_notes: string | null; created_at: string; customerName: string; customerPhone: string; serviceType: string; invoiceNumber: number | null; lineDescription: string };
const statuses = [{ value: "new", label: "جديد" }, { value: "under_review", label: "قيد المراجعة" }, { value: "approved", label: "معتمد" }, { value: "rejected", label: "مرفوض" }, { value: "resolved", label: "مغلق" }];

export default function WarrantyClaimsManager({ claims }: { claims: WarrantyClaim[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { status: string; notes: string }>>(() => Object.fromEntries(claims.map((claim) => [claim.id, { status: claim.status, notes: claim.admin_notes ?? "" }])));
  const [error, setError] = useState("");
  async function save(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setBusyId(id); setError("");
    const { error: updateError } = await createClient().rpc("admin_update_warranty_claim", { target_claim_id: id, new_status: draft.status, new_admin_notes: draft.notes || null });
    setBusyId("");
    if (updateError) { setError("تعذر تحديث مطالبة الضمان."); return; }
    router.refresh();
  }
  if (!claims.length) return <div className="emptyState"><h2>لا توجد مطالبات ضمان</h2><p>ستظهر المطالبات المرتبطة بالفواتير هنا.</p></div>;
  return <>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="warrantyClaims">{claims.map((claim) => { const draft = drafts[claim.id] ?? { status: claim.status, notes: claim.admin_notes ?? "" }; return <article className="card warrantyClaimCard" key={claim.id}>
    <div className="contactInboxHead"><div><p className="eyebrow">فاتورة #{claim.invoiceNumber ?? "—"}</p><h2>{claim.lineDescription}</h2></div><time>{new Date(claim.created_at).toLocaleString("ar-SA")}</time></div>
    <p><strong>{claim.customerName}</strong> · {claim.customerPhone || "—"} · {claim.serviceType}</p><p className="contactMessageBody">{claim.description}</p>
    <div className="warrantyReview"><label>الحالة<select value={draft.status} onChange={(event) => setDrafts((current) => ({ ...current, [claim.id]: { ...draft, status: event.target.value } }))}>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label><label>ملاحظات الإدارة<textarea rows={2} value={draft.notes} onChange={(event) => setDrafts((current) => ({ ...current, [claim.id]: { ...draft, notes: event.target.value } }))} /></label><button className="button primary compactButton" disabled={busyId === claim.id} onClick={() => save(claim.id)}>حفظ المتابعة</button></div>
  </article>; })}</div></>;
}
