alter table public.site_settings drop constraint if exists site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check check (key in (
  'logo_text','logo_text_en','logo_image_url','primary_color','accent_color','background_color',
  'header_cta_text','header_cta_text_en','request_cta_text','request_cta_text_en',
  'header_request_cta_visible'
));

insert into public.site_settings(key,value) values ('header_request_cta_visible','true')
on conflict (key) do nothing;
