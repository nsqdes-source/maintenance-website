import { createHash } from "node:crypto";

import {
  applyVerifiedProviderResult,
  getGatewayRuntimeConfig,
  postVerifiedAttempt,
  recordVerifiedProviderEvent,
} from "@/lib/payments/gateway-server";
import {
  type PaymentProviderAdapter,
  type ProviderWebhookInput,
  validateNormalizedProviderEvent,
} from "@/lib/payments/provider-adapter";

export const MAX_PROVIDER_WEBHOOK_BYTES = 1024 * 1024;

export async function processProviderWebhook(
  adapter: PaymentProviderAdapter,
  input: ProviderWebhookInput,
) {
  if (
    input.rawBody.byteLength === 0 ||
    input.rawBody.byteLength > MAX_PROVIDER_WEBHOOK_BYTES
  ) {
    throw new Error("provider_webhook_body_size_invalid");
  }

  const config = await getGatewayRuntimeConfig();

  if (!config.paymentDomainEnabled || !config.gatewayEnabled) {
    throw new Error("gateway_not_enabled");
  }

  if (
    !config.provider ||
    !config.environment ||
    config.provider !== adapter.providerId ||
    config.environment !== adapter.environment
  ) {
    throw new Error("gateway_adapter_configuration_mismatch");
  }

  const verified = await adapter.verifyAndNormalizeWebhook(input);

  if (!verified.verified) {
    throw new Error("provider_signature_verification_failed");
  }

  if (!validateNormalizedProviderEvent(verified.event)) {
    throw new Error("invalid_normalized_provider_event");
  }

  const event = verified.event;
  const payloadHash = createHash("sha256")
    .update(input.rawBody)
    .digest("hex");

  const eventId = await recordVerifiedProviderEvent({
    providerEventId: event.providerEventId,
    eventType: event.eventType,
    payloadHash,
    paymentAttemptId: event.paymentAttemptId,
    providerTransactionId: event.providerTransactionId ?? null,
    safeMetadata: event.safeMetadata ?? {},
  });

  const processingStatus = await applyVerifiedProviderResult({
    eventId,
    result: event.result,
    providerTransactionId: event.providerTransactionId ?? null,
    confirmedAmount: event.confirmedAmount ?? null,
    confirmedCurrency: event.confirmedCurrency ?? null,
    failureCode: event.failureCode ?? null,
  });

  let receiptId: string | null = null;

  if (
    event.result === "succeeded" &&
    processingStatus === "ready_for_posting"
  ) {
    receiptId = await postVerifiedAttempt({
      attemptId: event.paymentAttemptId,
      idempotencyKey: `provider-event:${event.providerEventId}`,
    });
  }

  return {
    eventId,
    processingStatus,
    receiptId,
  };
}
