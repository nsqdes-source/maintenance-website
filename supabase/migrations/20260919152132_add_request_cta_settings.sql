alter table public.site_settings drop constraint if exists site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check check (key in (
  'logo_text','logo_text_en','logo_image_url','primary_color','accent_color','background_color',
  'header_cta_text','header_cta_text_en','request_cta_text','request_cta_text_en'
));
insert into public.site_settings(key,value) values
  ('request_cta_text','اطلب خدمة'),('request_cta_text_en','Request service')
on conflict (key) do nothing;
