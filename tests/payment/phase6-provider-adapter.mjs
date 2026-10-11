import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync("lib/payments/provider-adapter.ts", "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const module = { exports: {} };
new Function("require", "module", "exports", output)(
  require,
  module,
  module.exports,
);

const { validateNormalizedProviderEvent } = module.exports;
const attemptId = "00000000-0000-4000-8000-000000000001";

test("accepts a complete normalized success event", () => {
  assert.equal(
    validateNormalizedProviderEvent({
      providerEventId: "evt-1",
      eventType: "payment.succeeded",
      result: "succeeded",
      paymentAttemptId: attemptId,
      providerTransactionId: "txn-1",
      confirmedAmount: 25,
      confirmedCurrency: "SAR",
      safeMetadata: { source: "test" },
    }),
    true,
  );
});

test("requires attempt correlation before any event enters the processor", () => {
  assert.equal(
    validateNormalizedProviderEvent({
      providerEventId: "evt-1",
      eventType: "payment.pending",
      result: "pending",
    }),
    false,
  );
});

test("rejects success without authoritative confirmation fields", () => {
  assert.equal(
    validateNormalizedProviderEvent({
      providerEventId: "evt-1",
      eventType: "payment.succeeded",
      result: "succeeded",
      paymentAttemptId: attemptId,
    }),
    false,
  );
});

test("accepts ordinary two-decimal monetary values", () => {
  for (const amount of [25, 25.1, 0.29, 57.5, 100.01]) {
    assert.equal(
      validateNormalizedProviderEvent({
        providerEventId: `evt-${amount}`,
        eventType: "payment.succeeded",
        result: "succeeded",
        paymentAttemptId: attemptId,
        providerTransactionId: `txn-${amount}`,
        confirmedAmount: amount,
        confirmedCurrency: "SAR",
      }),
      true,
    );
  }
});

test("rejects malformed currency, amount and attempt identity", () => {
  for (const candidate of [
    {
      providerEventId: "evt",
      eventType: "payment.succeeded",
      result: "succeeded",
      paymentAttemptId: attemptId,
      providerTransactionId: "txn",
      confirmedAmount: 25,
      confirmedCurrency: "usd",
    },
    {
      providerEventId: "evt",
      eventType: "payment.succeeded",
      result: "succeeded",
      paymentAttemptId: attemptId,
      providerTransactionId: "txn",
      confirmedAmount: -1,
      confirmedCurrency: "SAR",
    },
    {
      providerEventId: "evt",
      eventType: "payment.succeeded",
      result: "succeeded",
      paymentAttemptId: attemptId,
      providerTransactionId: "txn",
      confirmedAmount: 25.123,
      confirmedCurrency: "SAR",
    },
    {
      providerEventId: "evt",
      eventType: "payment.pending",
      result: "pending",
      paymentAttemptId: "not-a-uuid",
    },
  ]) {
    assert.equal(validateNormalizedProviderEvent(candidate), false);
  }
});

test("rejects oversized or non-object safe metadata", () => {
  assert.equal(
    validateNormalizedProviderEvent({
      providerEventId: "evt",
      eventType: "payment.pending",
      result: "pending",
      paymentAttemptId: attemptId,
      safeMetadata: { value: "x".repeat(5000) },
    }),
    false,
  );

  assert.equal(
    validateNormalizedProviderEvent({
      providerEventId: "evt",
      eventType: "payment.pending",
      result: "pending",
      paymentAttemptId: attemptId,
      safeMetadata: [],
    }),
    false,
  );
});
