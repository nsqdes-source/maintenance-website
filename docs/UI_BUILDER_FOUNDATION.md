# UI-Builder Foundation

Scope: `nsqdes-source/maintenance-website`, branch `codex/phase-0-2-stabilization`.
Base HEAD: `2959ae1b728cec03c48f6683a11b24b7e3b48678`.
Supabase: `maintenance-website` (`wtmzvznsmitqmjgqwtnu`). Vercel: `maintenance-website`, team `nsq2`, Preview only.

## Sections and data

Managed slugs: `hero`, `trust`, `services`, `process`, `warranty`, `faq`, `promo`, `pricing`, `service-area`, `why-us`, `contact`. Existing `works` is also retained; its saved visibility is respected.

`site_sections.sort_order` determines rendered DOM order, with ID as a stable tie breaker. There are no CSS order constants. Section and item visibility are explicitly filtered in the public page, including for authenticated administrators. Public-read and admin-management policies remain separate and unchanged.

Editorial cards use `site_section_items`. Catalog category names, descriptions and pricing remain in `service_catalog_items`; active priced subservices and VAT-inclusive `gross_price` come from `service_catalog_services`. The editor never writes these Catalog tables. Legacy service item images are read only as a compatibility fallback by matching the canonical Catalog name. New image choices live in `style_config.catalog_images`, keyed by Catalog UUID. Hero visuals use those UUIDs and canonical names; service identities and prices are not duplicated.

Public rendering and iframe previews share `MarketingSections` and `SectionBlock`. Preview sizes are 1120px, 768px and 390px, so actual media queries apply. Preview anchors cannot navigate or submit requests. The existing contact form is used on the public page; a labelled placeholder is used in preview. Header/footer are outside the managed section list and are not duplicated in preview.

## Safe options

`style_config` is sanitized before rendering and saving. Unsupported keys/values are discarded. No user HTML, CSS, JavaScript, class names, or pixel values are accepted.

| Key | Allowed values |
| --- | --- |
| section_spacing_top / section_spacing_bottom | none, compact, normal, spacious |
| content_padding | none, small, medium, large |
| card_padding | small, medium, large |
| item_gap | tight, normal, wide |
| columns | 1, 2, 3, 4 |
| alignment | start, center |
| container_width | narrow, standard, wide |
| density | compact, normal, comfortable |
| card_style | outlined, soft, plain |
| image_ratio | square, landscape, portrait |
| variant | default, split, stacked |
| background | default, white, muted, brand |
| show_image / show_description | yes, no |

Central maps translate section spacing to 0/24/48/72px, padding to 0/12/24/36px, item gaps to 8/16/28px, and container widths to 840/1120/1320px. Tablet columns are capped at two; mobile always uses one. Mobile internal padding is capped independently for sections and cards.

Plain marketing text fields (`cta_label`, `secondary_cta_label`, `panel_eyebrow`, `panel_title`, `panel_description`, `panel_cta_label`, `note`, with optional `_en`) are bounded to 1200 characters and escaped by React. CTA destinations stay fixed. Image URLs must be HTTPS without embedded credentials, or local paths without protocol-relative URLs/backslashes.

## Editing and saving

HTML5 drag handles use separate section/item state. Item drops require the same parent section; selecting another section clears stale drag state. Every drag action also has accessible up/down buttons. Reordering normalizes the affected list to contiguous integer sort orders. It does not save automatically.

New sections/default editorial items are staged in editor state and written only by Save. Existing section text, visibility and order are preserved. Defaults are not a public rendering fallback: missing sections are not recreated for anonymous visitors because a hidden row is intentionally invisible under RLS.

**Initial content activation remains necessary:** the database currently contains only the original five section records. No content seed was run in this task. The seven new sections become public only after a super_admin saves them through the editor. Until that first save, the new Preview homepage shows the currently saved visible sections only. Existing Production frontend was not deployed or changed.

Saving writes the underlying tables directly, then records a `site_editor_versions` snapshot with `status=draft`. This is an archive, not an isolated draft/publish system. Saves are sequential, not atomic: partial failures are disclosed and successfully saved IDs are retained for retry. Removed items are deleted on Save. Uploading an image still uses the existing upload component/storage behavior. General identity setting writes are restricted to changed identity fields; marketing setting keys are not rewritten.

## Approved schema change

`20261004083742_expand_site_sections_slugs.sql` expands only `site_sections_slug_check`, preserving the five original values and adding exactly seven requested values. It was applied and verified in the approved Supabase project. No columns, content rows, RLS, grants, functions or triggers were changed.

## Validation and remaining limits

- `npm run build`: passes.
- `npx tsc --noEmit --incremental false`: passes.
- Targeted ESLint: passes.
- `node tests/site-builder-foundation.mjs`: six passing tests, including unsafe configuration rejection, text escaping, visibility and Catalog identity isolation.
- Isolated browser fixture: section/item drag, keyboard reordering, blocked cross-section drag, text/hide/show, spacing, responsive columns, save/retry and shared rendering passed. Persistence was mocked; no live content writes occurred.
- Real local homepage using approved Supabase: HTTP 200, Catalog services rendered. Unauthenticated editor access redirects to `/admin/login`. Request form opens; no request was submitted.
- Live super_admin save/reload and authenticated content comparison were not verified because login credentials were unavailable.

`npm run check:public-read-policies` still fails on the unchanged baseline. Its string search scans comments and finds `current_user_has_role` in the guard migration's explanatory comment. All four protected policy predicates in the file match live Supabase and do not call the role helper. The role helper remains only in independent admin-management policies. A comment-aware script fix needs separate user approval; no guard/RLS edits were made.

No Production deployment, main merge, destructive Supabase change, or changes to request/Auth/Finance/Technician/Marketing integrations were performed. Full acceptance remains pending the guard correction, initial section save, authenticated/live editor verification and matching Vercel Preview verification.
