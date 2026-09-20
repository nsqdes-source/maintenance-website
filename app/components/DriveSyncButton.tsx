"use client";
import { useState } from "react";
export default function DriveSyncButton({ type, id, synced = false }: { type: "invoice" | "request_image"; id: string; synced?: boolean }) {
  const [done, setDone] = useState(synced);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function sync() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/drive/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id }) });
      const body = await response.json();
      if (!response.ok) setError(body.error || "تعذرت المزامنة.");
      else setDone(true);
    } catch { setError("تعذرت المزامنة."); }
    setBusy(false);
  }
  return <span className="driveSyncControl"><button type="button" disabled={done || busy} onClick={sync}>{done ? "✓ في Drive" : busy ? "جارٍ النسخ..." : "نسخ إلى Drive"}</button>{error ? <small role="alert">{error}</small> : null}</span>;
}
