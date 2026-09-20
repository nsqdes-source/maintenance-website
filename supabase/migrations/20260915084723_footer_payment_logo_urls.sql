-- Payment logos are administrator-supplied image URLs; no provider artwork is bundled with the site.
alter table public.site_footer_content
  add column if not exists payment_logo_urls jsonb not null default '{}'::jsonb;

alter table public.site_footer_content
  drop constraint if exists site_footer_content_payment_logo_urls_object;
alter table public.site_footer_content
  add constraint site_footer_content_payment_logo_urls_object check (jsonb_typeof(payment_logo_urls) = 'object');
