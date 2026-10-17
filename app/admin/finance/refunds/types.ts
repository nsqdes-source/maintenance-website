export type RefundOperation = {
  id: string;
  service_request_id: string;
  invoice_id: string | null;
  amount: number;
  currency: string;
  status:
    | "requested"
    | "approved"
    | "pending"
    | "succeeded"
    | "failed"
    | "rejected"
    | "cancelled";
  reason: string;
  note: string;
  provider: string | null;
  provider_refund_id: string | null;
  requested_at: string;
  approved_at: string | null;
  completed_at: string | null;
  failure_code: string | null;
  origin_type: "service_request_payment" | "invoice_payment";
  origin_id: string;
  origin_amount: number;
  origin_method: string;
  origin_paid_at: string;
  invoice_number: number | null;
  customer_name: string | null;
  can_decide: boolean;
  can_cancel: boolean;
  provider_processing_state:
    | "manual"
    | "ready_for_provider"
    | "provider_pending"
    | "provider_terminal"
    | "not_ready";
};

export type RefundOperations = {
  payment_domain_enabled: boolean;
  refunds: RefundOperation[];
  limit: number;
  offset: number;
};
