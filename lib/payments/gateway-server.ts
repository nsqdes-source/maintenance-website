import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { VerifiedProviderResult } from "@/lib/payments/provider-adapter";

export type { VerifiedProviderResult };

export async function getGatewayRuntimeConfig() {
  const db = createServiceRoleClient();
  const { data, error } = await db.rpc("gateway_get_runtime_config");

  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("gateway_settings_not_initialized");

  return {
    paymentDomainEnabled: Boolean(row.payment_domain_enabled),
    gatewayEnabled: Boolean(row.gateway_enabled),
    provider: typeof row.provider === "string" ? row.provider : null,
    environment:
      row.environment === "live" || row.environment === "test"
        ? row.environment
        : null,
  } as const;
}

export async function recordVerifiedProviderEvent(input: {
  providerEventId: string;
  eventType: string;
  payloadHash: string;
  paymentAttemptId?: string | null;
  providerTransactionId?: string | null;
  safeMetadata?: Record<string, unknown>;
}) {
  const db = createServiceRoleClient();
  const { data, error } = await db.rpc(
    "gateway_record_verified_provider_event",
    {
      p_provider_event_id: input.providerEventId,
      p_event_type: input.eventType,
      p_payload_hash: input.payloadHash,
      p_payment_attempt_id: input.paymentAttemptId ?? null,
      p_provider_transaction_id: input.providerTransactionId ?? null,
      p_safe_metadata: input.safeMetadata ?? {},
    }
  );

  if (error) throw new Error(error.message);
  return data as string;
}

export async function applyVerifiedProviderResult(input: {
  eventId: string;
  result: VerifiedProviderResult;
  providerTransactionId?: string | null;
  confirmedAmount?: number | null;
  confirmedCurrency?: string | null;
  failureCode?: string | null;
}) {
  const db = createServiceRoleClient();
  const { data, error } = await db.rpc(
    "gateway_apply_verified_provider_result",
    {
      p_event_id: input.eventId,
      p_result: input.result,
      p_provider_transaction_id: input.providerTransactionId ?? null,
      p_confirmed_amount: input.confirmedAmount ?? null,
      p_confirmed_currency: input.confirmedCurrency ?? null,
      p_failure_code: input.failureCode ?? null,
    }
  );

  if (error) throw new Error(error.message);
  return data as string;
}

export async function postVerifiedAttempt(input: {
  attemptId: string;
  idempotencyKey: string;
}) {
  const db = createServiceRoleClient();
  const { data, error } = await db.rpc(
    "gateway_post_verified_attempt",
    {
      p_attempt_id: input.attemptId,
      p_idempotency_key: input.idempotencyKey,
    }
  );

  if (error) throw new Error(error.message);
  return data as string;
}

export async function getProviderRefundContext(refundId: string) {
  const db = createServiceRoleClient();
  const { data, error } = await db.rpc("gateway_get_refund_context", {
    p_refund_id: refundId,
  });

  if (error) throw new Error(error.message);
  return data as {
    refund_id: string;
    service_request_id: string;
    amount: number;
    currency: string;
    status: "approved" | "pending";
    provider: string;
    environment: "test" | "live";
    provider_refund_id: string | null;
    payment_attempt_id: string;
    origin_provider_transaction_id: string;
  };
}

export async function startProviderRefund(input: {
  refundId: string;
  providerRefundId: string;
}) {
  const db = createServiceRoleClient();
  const { data, error } = await db.rpc("gateway_start_refund", {
    p_refund_id: input.refundId,
    p_provider_refund_id: input.providerRefundId,
  });

  if (error) throw new Error(error.message);
  return data as "pending";
}

export async function applyVerifiedRefundResult(input: {
  refundId: string;
  providerRefundId: string;
  result: "succeeded" | "failed";
  failureCode?: string | null;
}) {
  const db = createServiceRoleClient();
  const { data, error } = await db.rpc(
    "gateway_apply_verified_refund_result",
    {
      p_refund_id: input.refundId,
      p_provider_refund_id: input.providerRefundId,
      p_result: input.result,
      p_failure_code: input.failureCode ?? null,
    },
  );

  if (error) throw new Error(error.message);
  return data as "succeeded" | "failed";
}
