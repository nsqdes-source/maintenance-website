export const RULES_VERSION = 'zatca-ksa-v1-phase2';
export const CALCULATION_POLICY = 'gross-inclusive-15-v1';
export type BlockerCode =
  | 'SOURCE_INVOICE_NOT_DRAFT' | 'SELLER_VAT_MISSING' | 'SELLER_VAT_INVALID'
  | 'SELLER_NOT_VAT_REGISTERED' | 'SELLER_IDENTITY_MISMATCH' | 'SELLER_REGISTRATION_REQUIRED'
  | 'SELLER_ADDRESS_INCOMPLETE' | 'BUYER_TYPE_UNKNOWN' | 'BUYER_VAT_STATUS_UNKNOWN'
  | 'BUYER_NAME_REQUIRED' | 'BUYER_VAT_REQUIRED' | 'BUYER_IDENTIFIER_REQUIRED'
  | 'BUYER_IDENTIFIER_INVALID' | 'BUYER_ADDRESS_INCOMPLETE' | 'UNSUPPORTED_TRANSACTION'
  | 'UNSUPPORTED_DOCUMENT_KIND' | 'UNSUPPORTED_CURRENCY' | 'UNSUPPORTED_VAT_CATEGORY'
  | 'UNSUPPORTED_VAT_RATE' | 'ALLOWANCE_CHARGE_UNSUPPORTED' | 'SUPPLY_DATE_REQUIRED'
  | 'LINE_DATA_INVALID' | 'LINE_TOTAL_MISMATCH' | 'INVOICE_TOTAL_MISMATCH'
  | 'PREPAYMENT_CONTEXT_UNRESOLVED' | 'PREPAYMENT_UNSUPPORTED_V1' | 'PAYMENT_DUPLICATE_SOURCE'
  | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'INVOICE_NOT_FOUND' | 'DOCUMENT_NOT_CURRENT' | 'DOCUMENT_VERSION_CONFLICT' | 'CONCURRENCY_RETRY_REQUIRED' | 'RPC_OPERATION_INVALID' | 'PERSISTENCE_UNAVAILABLE'
  | 'SOURCE_CHANGED' | 'RULES_VERSION_UNSUPPORTED' | 'SELLER_PROFILE_REQUIRED'
  | 'PREPARATION_STATE_INVALID' | 'REVISION_REQUIRED' | 'CANONICAL_INVALID';
export type Blocker = { code: BlockerCode; severity: 'ERROR'; field?: string };
export type Result<T> = { ok: true; value: T } | { ok: false; blockers: Blocker[] };
export type Address = { street: string; buildingNumber: string; district: string; city: string; postalCode: string; countryCode: string; additionalNumber?: string | null };
export type BuyerInput = {
  buyerType?: 'consumer' | 'business' | 'government' | 'unknown' | 'export' | 'special_case';
  vatRegistrationStatus: 'registered' | 'not_registered' | 'unknown';
  name: string | null; vatNumber: string | null;
  otherIdentifier: { scheme: string; value: string } | null; address: Address | null;
  identityConfirmed: boolean; transactionCountry: string;
};
export type PaymentDecision = { context: 'internal_collection' | 'taxable_prepayment'; actorId: string; decidedAt: string; reason: string; recordIds: string[] };
export type PreparationInput = { buyer: BuyerInput; supplyDate: string | null; documentKind: string; flags: Record<string, boolean>; paymentDecision?: PaymentDecision };
export type InvoiceSource = { id: string; number: string; status: string; businessName: string; businessVat: string; vatRegistered: boolean; currency: string; taxRate: string; subtotal: string; taxAmount: string; total: string };
export type LineSource = { id: string; description: string; quantity: string; unitPrice: string; sortOrder: number; taxCategory: string; allowances: string[]; charges: string[]; unitCode?: string | null };
export type SellerProfile = { id: string; active: boolean; legalName: string; vatNumber: string; registration: { scheme: string; value: string }; address: Address };
export type PaymentRecord = { sourceTable: 'invoice_payments' | 'service_request_payments'; id: string; amount: string; paidAt: string; voidedAt: string | null; transferredInvoicePaymentId: string | null };
export type Sources = { invoice: InvoiceSource; lines: LineSource[]; sellers: SellerProfile[]; payments: PaymentRecord[] };
export type CanonicalLine = { id: string; sourceLineId: string; description: string; quantity: string; unitCode: string | null; grossUnitPrice: string; netUnitPrice: string; priceBaseQuantity: string; priceIncludesVat: true; taxCategory: 'S'; taxRate: '15.00'; netAmount: string; vatAmount: string; grossAmount: string; allowances: []; charges: [] };
export type Totals = { lineExtensionAmount: string; allowanceTotal: string; chargeTotal: string; taxExclusiveAmount: string; vatAmount: string; taxAccountingAmount: string; taxInclusiveAmount: string; prepaidAmount: string; payableAmount: string; payableRoundingAmount: string };
export type Canonical = {
  metadata: { modelVersion: 1; rulesVersion: string; calculationPolicy: string; environment: 'simulation'; sourceInvoiceId: string; documentId: string; revisionNo: number; preparedAt: string };
  seller: SellerProfile;
  buyer: BuyerInput;
  invoice: { id: string; number: string; uuid: string; profileId: 'reporting:1.0'; scheme: 'standard' | 'simplified'; kind: 'invoice'; typeCode: '388'; transactionCode: '0100000' | '0200000'; flags: Record<string, boolean>; currency: 'SAR'; taxCurrency: 'SAR'; issueAt: string | null; issueDate: string | null; issueTime: string | null; supplyDate: string | null; supplyEndDate: null };
  references: { originalInvoices: []; adjustmentReason: null; prepayments: [] };
  lines: CanonicalLine[];
  taxes: { category: 'S'; rate: '15.00'; taxableAmount: string; taxAmount: string; exemptionReasonCode: null; exemptionReasonText: null }[];
  totals: Totals;
  payment: { context: 'none' | 'internal_collection'; collectionRecords: PaymentRecord[]; collectedAmountAtFreeze: string; internalRemainingAtFreeze: string; contextDecision: PaymentDecision | null; meansCode: null };
  zatca: { uuid: string; egsUnitId: null; icv: null; pih: null };
};
export type Document = { id: string; invoiceId: string; uuid: string; revisionNo: number; status: 'draft' | 'prepared' | 'frozen' | 'canonical_validated'; snapshot: Canonical | null; fingerprint: string | null; frozenAt: string | null; validatedAt: string | null; issueAt: string | null; version: number };
