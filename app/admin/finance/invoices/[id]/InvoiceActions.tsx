"use client";

import { useState } from "react";

type InvoiceActionsProps = {
  invoiceId: string;
  customerEmail: string;
};

export default function InvoiceActions({
  invoiceId,
  customerEmail,
}: InvoiceActionsProps) {
  const [driveBusy, setDriveBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  async function syncToDrive() {
    setDriveBusy(true);
    setMessage("");
    setMessageType("");

    try {
      const response = await fetch("/api/drive/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "invoice",
          id: invoiceId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "تعذر رفع الفاتورة إلى Google Drive.");
        setMessageType("error");
        return;
      }

      if (result.alreadySynced) {
        setMessage("الفاتورة مرفوعة مسبقًا إلى Google Drive.");
      } else {
        setMessage("تم رفع الفاتورة إلى Google Drive بنجاح.");
      }

      setMessageType("success");
    } catch {
      setMessage("تعذر الاتصال بخدمة Google Drive.");
      setMessageType("error");
    } finally {
      setDriveBusy(false);
    }
  }

  async function sendEmail() {
    setEmailBusy(true);
    setMessage("");
    setMessageType("");

    try {
      const response = await fetch(
        `/api/finance/invoices/${invoiceId}/email`,
        {
          method: "POST",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "تعذر إرسال الفاتورة عبر البريد.");
        setMessageType("error");
        return;
      }

      setMessage(
        customerEmail
          ? `تم إرسال الفاتورة إلى ${customerEmail}.`
          : "تم إرسال الفاتورة عبر البريد بنجاح."
      );
      setMessageType("success");
    } catch {
      setMessage("تعذر الاتصال بخدمة البريد.");
      setMessageType("error");
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <div className="invoiceActions">
      <button
        type="button"
        className="button secondary"
        disabled={driveBusy || emailBusy}
        onClick={syncToDrive}
      >
        {driveBusy ? "جارٍ الرفع..." : "رفع إلى Google Drive"}
      </button>

      <button
        type="button"
        className="button primary"
        disabled={driveBusy || emailBusy}
        onClick={sendEmail}
      >
        {emailBusy ? "جارٍ الإرسال..." : "إرسال عبر البريد"}
      </button>

      {message ? (
        <p
          className={
            messageType === "success"
              ? "inlineSuccess"
              : "inlineError"
          }
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}