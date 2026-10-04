-- Expand only the homepage section slug allowlist. No content or policy changes.
begin;
alter table public.site_sections drop constraint site_sections_slug_check;
alter table public.site_sections add constraint site_sections_slug_check
  check (slug in ('hero', 'services', 'why-us', 'works', 'contact',
    'trust', 'process', 'warranty', 'faq', 'promo', 'pricing', 'service-area'));
commit;
