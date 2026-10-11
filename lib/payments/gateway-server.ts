import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type VerifiedProviderResult =
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled";

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
