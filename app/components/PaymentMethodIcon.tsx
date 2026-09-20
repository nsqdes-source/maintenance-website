type Method = "mada" | "visa" | "mastercard" | "apple_pay" | "bank_transfer" | "cash";

const labels: Record<Method, string> = { mada: "مدى", visa: "Visa", mastercard: "Mastercard", apple_pay: "Apple Pay", bank_transfer: "تحويل بنكي", cash: "نقدًا" };

export default function PaymentMethodIcon({ method }: { method: Method }) {
  const common = { viewBox: "0 0 48 32", "aria-hidden": true, focusable: false };
  if (method === "mastercard") return <span className="paymentIcon mastercard" role="img" aria-label={labels[method]}><svg {...common}><circle cx="19" cy="16" r="10" fill="#eb001b"/><circle cx="29" cy="16" r="10" fill="#f79e1b"/><path d="M24 7.4a10 10 0 0 1 0 17.2 10 10 0 0 1 0-17.2Z" fill="#ff5f00"/></svg></span>;
  if (method === "mada") return <span className="paymentIcon mada" role="img" aria-label={labels[method]}><svg {...common}><path d="M6 10h36v12H6z" rx="3" fill="#0ab3b4"/><path d="M12 16c3-5 7-5 10 0s7 5 10 0" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/><circle cx="36" cy="16" r="2.2" fill="#d8ffff"/></svg></span>;
  if (method === "visa") return <span className="paymentIcon visa" role="img" aria-label={labels[method]}><svg {...common}><path d="M5 8h38v16H5z" rx="3" fill="#154a9a"/><path d="m14 10 6 12h-4L10 10h4Zm8 0h5l-3 12h-5l3-12Zm8 0h9l-1 3h-5l-.4 1.6h5l-1 3h-4.8l-.5 1.6H37l-1 2.8h-9l3-12Z" fill="#fff"/></svg></span>;
  if (method === "apple_pay") return <span className="paymentIcon applePay" role="img" aria-label={labels[method]}><svg {...common}><rect x="5" y="7" width="38" height="18" rx="4" fill="#111"/><path d="M23 10c.7-1 1.8-1.6 3-1.7-.1 1.2-.7 2.2-1.5 2.8-.8.6-1.8 1-2.8.9-.1-1 .4-1.6 1.3-1.9Zm6.4 8.7c-.5 1.2-1.2 2.4-2.2 2.4-.8 0-1.1-.5-2.1-.5s-1.4.5-2.1.5c-1 0-1.8-1.2-2.3-2.4-1-2.4-.3-5.2 1.3-5.2.8 0 1.5.5 2.1.5.6 0 1.4-.6 2.4-.5.4 0 1.7.2 2.5 1.5-1.8 1-1.5 3.6.4 4.7Z" fill="#fff"/><path d="M32 12h6m-6 4h5m-5 4h6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round"/></svg></span>;
  if (method === "bank_transfer") return <span className="paymentIcon bank" role="img" aria-label={labels[method]}><svg {...common}><path d="M7 14 24 6l17 8v3H7v-3Zm4 6h26v5H11v-5Zm-3 7h32" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 18v7m6-7v7m6-7v7m6-7v7" stroke="currentColor" strokeWidth="2.3"/></svg></span>;
  return <span className="paymentIcon cash" role="img" aria-label={labels[method]}><svg {...common}><rect x="6" y="8" width="36" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2.7"/><circle cx="24" cy="16" r="4" fill="none" stroke="currentColor" strokeWidth="2.2"/><path d="M11 12h2m22 8h2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg></span>;
}

export function isPaymentMethod(method: string): method is Method { return method in labels; }
