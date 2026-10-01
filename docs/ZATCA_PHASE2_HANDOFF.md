# ZATCA Phase 2 Handoff

## Scope

Phase 2 implements the local preparation foundation for ZATCA invoice processing.

This phase includes:

- invoice classification
- canonical preparation
- exact decimal calculations
- source fingerprinting
- persistence lifecycle
- frozen snapshot handling
- revision handling
- server-side authorization
- payment-context gates
- CAS/version protection
- concurrency protection
- runtime validation

This phase does **not** implement:

- XML generation
- XML signing
- QR generation
- ICV
- PIH
- EGS onboarding
- ZATCA API submission
- production issuance

---

## Repository

Repository:

`nsqdes-source/maintenance-website`

Branch:

`codex/zatca-integration`

Phase 2 implementation commit:

`752de0eaa7782da3a000251c3a137d7ce0975d51`

Commit message:

`feat: add zatca phase 2 preparation foundation`

Remote verification:

- local HEAD = `752de0eaa7782da3a000251c3a137d7ce0975d51`
- remote HEAD = `752de0eaa7782da3a000251c3a137d7ce0975d51`

No merge to `main` was performed.

---

## Approved Migrations

### Preparation Layer

File:

`supabase/migrations/20260930220811_zatca_preparation_layer.sql`

SHA-256:

`d250f0251881d77da01655d9ec17fc51e3e91a9fa3e5eaca1d115c24ef325660`

### Local Persistence

File:

`supabase/migrations/20260930225817_zatca_local_persistence.sql`

SHA-256:

`673a2d7c880ebc937aa8c2d934e6b67709f73262f7835fd0f1d75e745bf90fde`

---

## TypeScript Implementation

Files:

- `lib/zatca/decimal.ts`
- `lib/zatca/persistence.server.ts`
- `lib/zatca/persistence.ts`
- `lib/zatca/preparation.ts`
- `lib/zatca/seller-loader.ts`
- `lib/zatca/server.ts`
- `lib/zatca/types.ts`

Tests:

- `tests/zatca/preparation.test.mjs`
- `tests/zatca/persistence.test.mjs`

Development dependency:

`@electric-sql/pglite@0.5.8`

Test command:

`npm run test:zatca`

---

## Local Validation

Completed successfully:

- ZATCA tests: `85 / 85 PASS`
- TypeScript: PASS
- Next.js build: PASS
- scoped ESLint for `lib/zatca` and `tests/zatca`: PASS
- `git diff --check`: PASS

The full-project ESLint has pre-existing unrelated issues and was not treated as a Phase 2 blocker.

---

## Runtime Test Project

Disposable runtime project:

- name: `maintenance-website-zatca-runtime-test`
- ref: `tzqnljjlrkacnjqyogcj`
- region: `ap-southeast-1`

This project was used only for Phase 2 runtime validation.

Production Supabase was not used for Phase 2 runtime tests.

---

## Runtime Validation Results

### Lifecycle

Validated successfully:

- first `prepare`
- repeated `prepare`
- `freeze`
- `canonical_validate`
- `create_revision`
- prepare-after-freeze rejection
- revision supersession behavior
- new revision starts clean

### Frozen Snapshot

Validated successfully:

- live commercial source was modified after freeze
- canonical validation still used the frozen snapshot
- frozen snapshot remained unchanged

### Immutability

Validated successfully:

- UPDATE on frozen/validated document rejected with:

`FROZEN_DOCUMENT_IMMUTABLE`

- DELETE on frozen/validated document rejected with:

`FROZEN_DOCUMENT_IMMUTABLE`

### Authorization

Validated with real Auth sessions:

- `customer` → FORBIDDEN
- `technician` → FORBIDDEN
- `maintenance_manager` → FORBIDDEN
- `admin_manager` → ALLOWED
- `super_admin` → ALLOWED

Denied roles did not instantiate the privileged service-role client.

Also validated:

- actor spoof → FORBIDDEN
- server-side role revocation after adapter creation → FORBIDDEN
- role restored successfully after test

### CAS / Version Protection

Validated stale version rejection:

`DOCUMENT_VERSION_CONFLICT`

No partial write occurred.

### Payment Gates

Validated:

1. no prior payment → ALLOWED
2. unresolved prior payment → `PREPAYMENT_CONTEXT_UNRESOLVED`
3. taxable prepayment → `PREPAYMENT_UNSUPPORTED_V1`
4. explicit internal collection → ALLOWED

Internal collection canonical values verified:

- prepaid amount = `0.00`
- payable amount = `57.50`
- collected amount = `1.00`
- internal remaining amount = `56.50`

### Source Change Protection

Validated a live source modification after prepare and before freeze.

Freeze rejected with:

`SOURCE_CHANGED`

Document remained:

- status = `prepared`
- preparation version unchanged
- not frozen
- not canonical validated

### Real Concurrency

Validated using a real concurrent PostgreSQL advisory lock.

The persistence RPC waited approximately 3 seconds and returned:

`CONCURRENCY_RETRY_REQUIRED`

No partial write occurred.

### Final Runtime Invariants

Final read-only verification showed:

- ZATCA documents = 3
- draft = 1
- prepared = 1
- frozen = 0
- canonical_validated = 0
- superseded = 1
- unsigned XML documents = 0
- signed XML documents = 0
- XML hash documents = 0
- QR documents = 0
- ICV documents = 0
- ZATCA events = 0
- EGS units = 0

Both commercial test invoices remained:

- status = `draft`
- `issued_at = null`
- `paid_at = null`
- currency = SAR
- total = 57.50

No commercial invoice was issued.

---

## Phase 2 Result

**Phase 2 Runtime Validation: COMPLETE / PASS**

The implementation is intentionally stopped before XML generation and external ZATCA integration.

---

## Environment Safety State

Production resources were not used for runtime validation.

Production/shared Supabase:

`maintenance-website`

Ref:

`wtmzvznsmitqmjgqwtnu`

Original ZATCA test project:

`maintenance-website-zatca-test`

Ref:

`xpvwkelctzgidpycflzw`

The original ZATCA test project remains paused/inactive and must not be resumed until the disposable runtime project is reviewed for deletion.

Disposable runtime project:

`maintenance-website-zatca-runtime-test`

Ref:

`tzqnljjlrkacnjqyogcj`

Do not delete the runtime project until explicitly approved.

---

## Next Phase Boundary

Future ZATCA work starts only after an explicit decision to begin the next phase.

Future work may include:

- XML model / UBL generation
- cryptographic hash construction
- signing
- QR generation
- ICV / PIH
- EGS onboarding
- compliance / reporting / clearance APIs

Do not introduce these concerns into Phase 2 retrospectively.

---

## Operational Rules

Before future ZATCA work:

1. verify repository:
   `nsqdes-source/maintenance-website`

2. verify branch and intended phase

3. verify Supabase target before any SQL or migration

4. never use:
   `maintenance-platform`

5. never use production for ZATCA development tests

6. do not merge to `main` or deploy to Production without explicit approval

7. preserve frozen historical ZATCA documents

8. do not silently repair legacy migration history

