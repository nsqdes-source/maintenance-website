# MUEEN — CURRENT PROJECT STATE

**Snapshot date:** 2026-10-04  
**Purpose:** baseline before modifying the public homepage and service-request UI.  
**Source of truth for this phase:** this document + live Git/Vercel/Supabase state verified on 2026-10-04.

---

## 1. Project identity and hard isolation rules

### Canonical project
- ChatGPT Project: `mintc-web`
- GitHub repository: `nsqdes-source/maintenance-website`
- Working branch: `codex/phase-0-2-stabilization`
- Current code baseline before UI work:
  `1e4f1e6587a1811e3acea1780f8651aa9ea507fe`
- Supabase production/shared project:
  - Name: `maintenance-website`
  - Ref: `wtmzvznsmitqmjgqwtnu`
  - Region: `ap-southeast-1`
- Vercel:
  - Team: `nsq2`
  - Project: `maintenance-website`
  - Project ID: `prj_pT1MTv9rtnUFk0VAvwzfQyG5ln0G`
- Production domains:
  - `mueenfix.com`
  - `www.mueenfix.com`

### Do not touch
- `maintenance-platform`
- historical GitHub target `rqmsa/maintenance-platform`
- historical Supabase ref `gpzdavebqwdpxkxdfwib`
- any Vercel project named `maintenance-platform`
- old/noncanonical maintenance-website worktrees or branches unless explicitly requested.

If any external write target resolves to a different repository, Supabase project, Vercel project, deployment environment, or branch: **STOP**.

---

## 2. Current production state

Production is currently serving code from:

- Commit:
  `1e4f1e6587a1811e3acea1780f8651aa9ea507fe`
- Commit message:
  `feat: wire Google Ads lead conversion with consent`
- Production deployment:
  `dpl_BU4n5Aqmh2ppyocxkQNwVjL7sf7p`
- Vercel state: `READY`
- Target: `production`
- Git branch recorded by Vercel:
  `codex/phase-0-2-stabilization`
- Aliases include:
  - `mueenfix.com`
  - `www.mueenfix.com`

No runtime error clusters were found in the immediate post-deployment check, and no warning/error runtime logs were returned for that deployment in the checked window.

The production deployment was created by Vercel as a redeploy of the approved code revision. The deployed Git SHA matches the approved Preview SHA exactly.

---

## 3. Recent completed work since the previous production baseline

Previous production baseline:
`7e6d5c46d77545b757c63c9010305b76ebf900d2`

Current baseline is **13 commits ahead**, with no commits behind.

Completed commits:

1. `25f5931e...` — restructure admin navigation shell.
2. `6c9d3d49...` — align catalog navigation with admin shell.
3. `458b3849...` — scaffold admin marketing section.
4. `dcf7f3fd...` — clarify site settings navigation.
5. `38ec3a7a...` — add marketing campaign builder and attribution analytics.
6. `af14f811...` — add marketing conversion event dashboard.
7. `5fb36ed7...` — add marketing integrations status dashboard.
8. `ef4ac9b4...` — add marketing privacy and tracking settings.
9. `68a44bc6...` — gate analytics behind user consent.
10. `fe8d3217...` — standard cookie consent experience.
11. `ec7f02e7...` — compact cookie consent for desktop/mobile.
12. `ed5c6011...` — manage marketing integration IDs from Admin.
13. `1e4f1e65...` — wire Google Ads lead conversion with consent.

Main code areas changed by those 13 commits:
- Admin navigation and admin CSS.
- Marketing admin area.
- Analytics/consent components.
- Root layout.
- Request funnel event tracking.
- Attribution tracking.
- Marketing event definitions.

---

## 4. Marketing and consent — current status

### Google Analytics 4
Configured from Admin, not hard-coded in application source.

Current stored ID:
`G-YYTP4WYX8G`

### Google Ads
Configured from Admin using the complete conversion destination:

`AW-18457156617/7po4CL_ymJAdEIm4h-FE`

The site sends a Google Ads conversion when:
1. a service request is successfully created,
2. `generate_lead` is reached,
3. advertising consent is enabled.

### Consent model
Current local-storage key:
`mueen:cookie-consent:v2`

Categories:
- Necessary: always on.
- Analytics: independent toggle.
- Advertising: independent toggle.

Supported choices:
- Accept all.
- Reject non-essential.
- Customize.

Verified on Preview:
- reject non-essential: PASS.
- analytics only: PASS.
- advertising only: PASS.
- accept all + successful service request: PASS.

### Privacy boundary for tracking events
Tracking code deliberately does **not** send:
- customer name,
- phone,
- email,
- full address,
- photos,
- request IDs.

### Attribution
First-touch attribution is stored in sessionStorage under:
`mueen:first-attribution:v1`

Tracked fields:
- landing page,
- referrer,
- UTM source/medium/campaign/content/term,
- gclid,
- wbraid,
- gbraid,
- first_touch_at.

### Deferred production measurement verification
Intentionally postponed until after the homepage and request-interface revisions:
- GA4 Realtime / DebugView confirmation.
- Google Ads conversion receipt confirmation.

Do not treat these deferred runtime reception checks as failed.

---

## 5. Supabase change made for Marketing Integrations

The production/shared Supabase project contains migration history entry:

- Version: `20261003223141`
- Name: `allow_marketing_integration_setting_keys`

Purpose:
extend `public.site_settings` key constraint to allow the seven approved marketing integration keys.

Allowed marketing keys:
- `marketing_ga_measurement_id`
- `marketing_gtm_id`
- `marketing_google_ads_id`
- `marketing_meta_pixel_id`
- `marketing_tiktok_pixel_id`
- `marketing_snap_pixel_id`
- `marketing_x_pixel_id`

No RLS policy or role grant was changed during that fix.

### Important reproducibility note
The remote migration exists in Supabase migration history, but as of this snapshot there is **no matching migration file in the repository's `supabase/migrations/` directory**.

This is a known state discrepancy and must **not** be silently repaired while doing homepage/request UI work.

---

## 6. Current homepage architecture

Primary file:
`app/page.tsx`

The homepage:
- reads editable sections from `site_sections`,
- reads section items from `site_section_items`,
- uses visibility and sort order from the database,
- supports Arabic/English text fallbacks,
- renders:
  - Hero,
  - Services,
  - Why us,
  - MarketingSections,
  - CTA,
  - Contact,
  - SiteFooter.
- Works section currently exists in code but is disabled by:
  `false && sectionIsVisible("works")`

Service cards route to service detail pages and the service request flow.

### Homepage dependency warning
Visual work on the homepage must preserve:
- database-driven section visibility,
- database-driven section ordering,
- Arabic/English fallbacks,
- links to service detail pages,
- request CTA routes,
- `MarketingSections`,
- contact form,
- footer.

Do not replace the page with a static-only version that bypasses `site_sections` or `site_section_items`.

---

## 7. Current service-request architecture

Primary files:
- `app/request/page.tsx`
- `app/request/RequestFunnel.tsx`
- `app/request/LocationPicker.tsx`

### Request page
The server page loads:
- visible parent service categories from `service_catalog_items`,
- active services from `service_catalog_services`.

These are passed into `RequestFunnel`.

### Request funnel
Current flow is five steps:
1. Service.
2. Details.
3. Location.
4. Schedule.
5. Submit.

Current operational behavior includes:
- category selection,
- one or more services,
- per-service quantities,
- calculated displayed total,
- issue description,
- optional photos,
- address and map coordinates,
- preferred date,
- preferred time period,
- customer identity validation,
- authenticated-user profile reuse,
- anonymous customer input,
- request submission via `submit_service_request_v4`,
- attachment upload to `request-images`,
- attachment registration through `attach_service_request_image`,
- redirect to request success page.

### Request tracking events
Existing funnel events:
- `start_request`
- `select_service`
- `select_issue`
- `upload_photo`
- `select_location`
- `select_preferred_time`
- `generate_lead`

### Critical request-flow boundary
Homepage/request UI work must not alter without explicit approval:
- RPC name or RPC argument mapping.
- attribution fields.
- storage bucket/path logic.
- upload-token handling.
- attachment RPC.
- validation rules.
- request success redirect semantics.
- analytics/Google Ads event trigger conditions.
- authentication/profile lookup logic.
- catalog queries/schema.

The visual layer may be redesigned, but these operational contracts are considered protected.

---

## 8. Admin state that must remain intact during public UI work

Admin navigation currently includes operational, catalog, finance, marketing, site settings, and dashboard sections.

Marketing admin includes:
- Overview.
- Campaigns / UTM Builder.
- Analytics.
- Conversions/events.
- Integrations.
- Settings/privacy.

Marketing Integration Manager:
- accepts only validated public IDs/destinations,
- rejects arbitrary JavaScript,
- does not store secrets,
- only GA4 and Google Ads are currently operational,
- other platform identifiers remain deferred.

Do not modify Admin during homepage/request visual work unless a UI requirement explicitly depends on it.

---

## 9. Deferred work register

Intentionally deferred:
- Google Tag Manager.
- Meta Pixel.
- TikTok Pixel.
- Snap Pixel.
- X Pixel.
- dynamic RBAC v2.
- `invoice.warranty_terms` follow-up.
- Supabase Leaked Password Protection warning.
- final production test-data cleanup.
- final Git/main merge strategy.
- broader privacy-policy/legal text review.
- production GA4/Google Ads reception verification.

These tasks are not part of the homepage/request redesign.

---

## 10. Legacy/stale documentation warning

`docs/WEBSITE_CONTEXT.md` is **historically stale**.

Examples:
- it references old repository identity `rqmsa/maintenance-website`,
- it reports scaffold/database/Vercel deployment as pending,
- it describes the initial architecture only.

Do not use it as the current source of truth for new work.

This file (`PROJECT_CURRENT_STATE_2026-10-04.md`) is the current baseline for the next UI phase.

---

## 11. Guardrails for the upcoming homepage + request UI phase

### Allowed primary scope
Prefer changes to:
- `app/page.tsx`
- `app/request/page.tsx`
- `app/request/RequestFunnel.tsx`
- UI-only styles in `app/globals.css`
- new presentational components/assets only when necessary.

### Protected unless explicitly approved
Do not change:
- Supabase schema/migrations.
- RLS or grants.
- RPCs.
- `lib/attribution.ts`.
- `lib/marketing-events.ts`.
- `app/components/AnalyticsConsent.tsx`.
- Marketing integration logic.
- Admin navigation/roles.
- Finance.
- Technician workflow.
- Auth.
- Vercel environment variables.
- Production deployment or aliases.
- `main`.

### Working method
For each UI task:
1. verify repository, branch, and HEAD before editing;
2. define exact files allowed for that task;
3. make the smallest isolated UI change;
4. keep business/data logic unchanged;
5. build/typecheck as applicable;
6. push only to `codex/phase-0-2-stabilization`;
7. review on Vercel Preview;
8. do not publish Production until explicitly approved.

---

## 12. Baseline acceptance before UI work

Current baseline is accepted for starting visual redesign because:
- production is READY on the exact approved SHA,
- consent behavior passed four Preview scenarios,
- request submission succeeded through all tested consent scenarios,
- GA4 and Google Ads IDs are stored and active,
- no immediate Vercel runtime errors were detected after production deployment.

The next task should therefore be treated as a **public UI redesign phase**, not as a backend, marketing, database, or admin refactor.

---

## 13. Protected invariant — anonymous public content must stay independent from role helper execution

A regression was found where anonymous visitors could not read public homepage/catalog content because public SELECT policies called `current_user_has_role(...)`, while the `anon` role did not have EXECUTE permission on that helper.

Permanent fix:
- Migration: `supabase/migrations/20261004100500_fix_anon_public_read_policies.sql`
- Applied migration: `fix_anon_public_read_policies`
- Fix commit: `0fc9b75769d109f878f9de7e92d52b5d73eb8e1d`

Protected public-read predicates:
- `site_sections` → `is_visible`
- `site_section_items` → item visible and parent section visible
- `service_catalog_items` → `is_visible`
- `service_catalog_services` → `is_active`

**Invariant:** do not reintroduce `current_user_has_role(...)` into these anonymous/public SELECT policies. Admin access to hidden or inactive content remains handled by separate authenticated admin-management policies.

Regression protection is now enforced by:
- `scripts/check-public-read-policy-guard.mjs`
- npm script `check:public-read-policies`
- GitHub Actions before the application build on `codex/phase-0-2-stabilization`.

This invariant is part of the homepage/request UI safety baseline and must remain intact during future migrations or RLS changes.

