# Phase 0 audit — 2026-09-21

Baseline: `58aed0e` (`codex/release-20260920`). Restore tag: `restore/pre-phase-0-20260921`.

## Baseline verification

- The release branch cloned cleanly and dependencies installed with no reported vulnerabilities.
- The initial lint had one blocking error in `CatalogManager` (`Date.now()` purity) and 29 warnings.
- The initial production build reached compilation but could not download Tajawal from Google Fonts in the restricted environment.
- Production was not modified during this audit.
- The older local workspace was intentionally left untouched because it contains unrelated uncommitted work.

## Findings and routing

| # | Finding | Baseline status | Route |
|---|---|---|---|
| 1 | Quote creation and invoice hand-off | Partially implemented; quote and invoice flows exist but are separate | Later finance batch |
| 2 | Intermittent catalogue save failure | Reproduced structurally: bulk upsert hides which record failed; lint blocker also present | Batch 1 |
| 3 | Header spacing after hiding CTA | Conditional rendering exists; desktop/mobile layout needs responsive redistribution | Batch 2 |
| 4 | Time range under preferred period | Period exists without visible hours | Batch 2 |
| 5 | Mobile navigation and brand name | Main links are hidden with no mobile replacement; brand name is hidden below 520px | Batch 2 |
| 6 | Long customer-facing request ID | Raw UUID displayed on success page | Batch 2 |
| 7 | Duplicate notifications | UI deduplicates only after reading; database permits repeated request/stage notifications | Batch 1 |
| 8 | Customer/technician sidebar overlap | Customer page misses the class that reserves sidebar space; mobile tables still overflow | Batch 1/2 |
| 9 | Technician image uploaded but not linked | PL/pgSQL function uses an ambiguous `technician_id` identifier; failed links leave orphan files | Batch 1 |
| 10 | Repeated request CTAs | Header toggle exists; footer and mobile placements are not independently controlled | Batch 2 |
| 11 | Contact form destination | Database-backed contact submission exists; administrative inbox remains a later scope | Later communication batch |
| 12 | Floating WhatsApp and central contact settings | Footer derives WhatsApp from the managed phone; no desktop floating shortcut | Batch 2 |
| 13 | Roles and permissions | Role checks and RLS exist; a full permission matrix and audit-log review remain | Later security batch |
| 14 | Payment page/providers | Ledger exists; payment gateway and webhooks are not implemented | Dedicated payment project |
| 15 | Warranty flow | Warranty policy and claim entry exist; detailed warranty terms per invoice item remain | Later warranty batch |
| 16 | Mark notifications as read | Individual read exists; mark-all does not | Batch 2 |
| 17 | Guest request tracking | Verified-email claiming exists; secure OTP tracking is not implemented | Later guest-tracking batch |
| 18 | Finance from workflow | Completed requests create invoice drafts | Existing, continue later |
| 19 | Invoice details imported from request | Customer and work snapshots exist; quote-line hand-off remains incomplete | Later finance batch |
| 20 | Draft saved but issue fails | VAT invoices are deliberately blocked without compliant e-invoicing; UI message is too generic | Batch 1 clarification/readiness |

## Acceptance gates

Batch 1 passes only if lint has no errors, the migration is syntactically reviewable, catalogue failures identify exact records, duplicate stages are prevented at the database, failed technician attachment uploads are rolled back, and invoice issue errors are actionable.

Batch 2 passes only if the header has a mobile menu, portal content does not require horizontal page scrolling, preferred periods show hours, the public request reference is compact, mark-all-read works, and request CTA placements can be controlled independently.
