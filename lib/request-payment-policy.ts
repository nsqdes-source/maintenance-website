export type PaymentTiming = "prepay" | "pay_on_arrival" | "pay_after_completion";
export type RequestPaymentPolicy = {
  configured: boolean;
  payment_domain_enabled: boolean;
  payment_policy_version: number | null;
  payment_policy: {
    original_timing: "customer_choice" | "prepay_required" | "pay_on_arrival" | "pay_after_completion";
    allow_pay_on_arrival: boolean;
    allow_pay_after_completion: boolean;
  } | null;
};

export const disabledRequestPaymentPolicy: RequestPaymentPolicy = {
  configured: false,
  payment_domain_enabled: false,
  payment_policy_version: null,
  payment_policy: null,
};

export function paymentTimingOptions(state: RequestPaymentPolicy): PaymentTiming[] {
  if (!state.configured || !state.payment_domain_enabled || !state.payment_policy) return [];
  const policy = state.payment_policy;
  if (policy.original_timing === "prepay_required") return ["prepay"];
  if (policy.original_timing === "pay_on_arrival") return policy.allow_pay_on_arrival ? ["pay_on_arrival"] : [];
  if (policy.original_timing === "pay_after_completion") return policy.allow_pay_after_completion ? ["pay_after_completion"] : [];
  if (policy.original_timing !== "customer_choice") return [];
  const options: PaymentTiming[] = ["prepay"];
  if (policy.allow_pay_on_arrival) options.push("pay_on_arrival");
  if (policy.allow_pay_after_completion) options.push("pay_after_completion");
  return options;
}

export function paymentChoiceForSubmission(state: RequestPaymentPolicy, choice: PaymentTiming | null) {
  if (!state.payment_domain_enabled) return null;
  const options = paymentTimingOptions(state);
  if (state.payment_policy?.original_timing !== "customer_choice") return options[0] ?? null;
  return choice && options.includes(choice) ? choice : null;
}
