export type PaymentPolicy = {
 schema_version: 1; original_timing: "customer_choice" | "prepay_required" | "pay_on_arrival" | "pay_after_completion";
 allow_pay_on_arrival: boolean; allow_pay_after_completion: boolean;
 additional_timing: "customer_choice" | "before_execution" | "after_execution";
 allow_work_before_balance: boolean; allowed_methods: string[];
 inspection_included_in_final: true; retain_earned_inspection_on_rejection: true; refund_excess: true;
};
export type PaymentSettings = {payment_policy: PaymentPolicy; payment_policy_version: number; payment_domain_enabled: boolean; gateway_enabled: boolean; gateway_provider: string | null; gateway_environment: string};
export const methods = [{value:"cash",label:"نقد"},{value:"bank_transfer",label:"تحويل بنكي"},{value:"card",label:"بطاقة"},{value:"other",label:"أخرى"}];
