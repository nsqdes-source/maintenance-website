export type GatewayEnvironment = "test" | "live";

export type VerifiedProviderResult =
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ProviderWebhookInput = {
  rawBody: Uint8Array;
  headers: Readonly<Record<string, string>>;
};

export type NormalizedProviderEvent = {
  providerEventId: string;
  eventType: string;
  result: VerifiedProviderResult;
  paymentAttemptId?: string | null;
  providerTransactionId?: string | null;
  confirmedAmount?: number | null;
  confirmedCurrency?: string | null;
  failureCode?: string | null;
  safeMetadata?: Record<string, unknown>;
};

export type VerifiedWebhookResult =
  | { verified: false }
  | { verified: true; event: NormalizedProviderEvent };

export interface PaymentProviderAdapter {
  readonly providerId: string;
  readonly environment: GatewayEnvironment;
  verifyAndNormalizeWebhook(
    input: ProviderWebhookInput,
  ): Promise<VerifiedWebhookResult>;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedText(
  value: string | null | undefined,
  max: number,
  required = false,
) {
  if (value == null) return !required;
  return value === value.trim() && value.length > 0 && value.length <= max;
}

export function validateNormalizedProviderEvent(
  event: NormalizedProviderEvent,
) {
  if (!boundedText(event.providerEventId, 200, true)) return false;
  if (!boundedText(event.eventType, 100, true)) return false;
  if (
    !["pending", "succeeded", "failed", "cancelled"].includes(event.result)
  ) {
    return false;
  }

  if (
    event.paymentAttemptId != null &&
    !uuidPattern.test(event.paymentAttemptId)
  ) {
    return false;
  }

  if (!boundedText(event.providerTransactionId, 200)) return false;
  if (!boundedText(event.failureCode, 100)) return false;

  if (event.confirmedAmount != null) {
    if (
      !Number.isFinite(event.confirmedAmount) ||
      event.confirmedAmount <= 0 ||
      Math.round(event.confirmedAmount * 100) !== event.confirmedAmount * 100
    ) {
      return false;
    }
  }

  if (
    event.confirmedCurrency != null &&
    !/^[A-Z]{3}$/.test(event.confirmedCurrency)
  ) {
    return false;
  }

  if (event.result === "succeeded") {
    if (
      !event.providerTransactionId ||
      event.confirmedAmount == null ||
      !event.confirmedCurrency
    ) {
      return false;
    }
  }

  if (event.safeMetadata != null) {
    if (
      typeof event.safeMetadata !== "object" ||
      Array.isArray(event.safeMetadata)
    ) {
      return false;
    }

    try {
      if (JSON.stringify(event.safeMetadata).length > 4096) return false;
    } catch {
      return false;
    }
  }

  return true;
}
