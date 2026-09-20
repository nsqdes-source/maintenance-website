-- Extend the public footer with configurable business-centre and payment presentation settings.
alter table public.site_footer_content
  add column if not exists business_center_label text not null default 'مركز الأعمال',
  add column if not exists business_center_url text not null default '/admin/login',
  add column if not exists business_center_logo_url text not null default '',
  add column if not exists payment_methods jsonb not null default '["mada","visa","mastercard","apple_pay","bank_transfer"]'::jsonb;

alter table public.site_footer_content
  drop constraint if exists site_footer_content_payment_methods_array;
alter table public.site_footer_content
  add constraint site_footer_content_payment_methods_array check (jsonb_typeof(payment_methods) = 'array');
