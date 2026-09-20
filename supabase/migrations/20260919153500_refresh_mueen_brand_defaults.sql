-- Refresh only untouched seed content. Administrator-customized values are preserved.
update public.site_settings
set value = 'معين'
where key = 'logo_text'
  and value = 'خدمات الصيانة';

insert into public.site_settings (key, value)
values ('logo_text_en', 'Mueen')
on conflict (key) do nothing;

update public.site_sections
set eyebrow = 'معين.. الصيانة أسهل',
    title = 'صيانة موثوقة. موعد واضح. سعر عادل.',
    description = 'خدمات التكييف والسباكة والكهرباء والنجارة، بطريقة منظمة من طلب الخدمة وحتى التنفيذ والمتابعة.',
    eyebrow_en = 'Mueen makes maintenance easier',
    title_en = 'Reliable maintenance. Clear appointment. Fair price.',
    description_en = 'Air conditioning, plumbing, electrical and carpentry services, managed from request to completion and follow-up.'
where slug = 'hero'
  and eyebrow = 'صيانة منزلية ومنشآت'
  and title = 'حلول صيانة موثوقة، عندما تحتاجها.'
  and description = 'نقدم خدمات الصيانة العامة في الكهرباء والتكييف والسباكة والنجارة وغيرها، مع طريقة سهلة لإرسال طلبك ومتابعته.';

update public.site_footer_content
set company_name = 'معين لخدمات الصيانة',
    description = 'معين.. الصيانة أسهل'
where id = true
  and company_name = 'خدمات الصيانة العامة'
  and description = 'خدمات صيانة عامة موثوقة وسريعة.';

-- Keep the seed item in the editor/database but hide it from the public four-service grid.
update public.site_section_items item
set is_visible = false
from public.site_sections section
where item.section_id = section.id
  and section.slug = 'services'
  and item.title = 'خدمات أخرى'
  and item.description = 'أرسل تفاصيل احتياجك وسنساعدك في تحديد الخدمة المناسبة.';

update public.site_section_items item
set sort_order = ordering.sort_order
from public.site_sections section,
  (values
    ('التكييف', 0),
    ('السباكة', 1),
    ('الكهرباء', 2),
    ('النجارة', 3)
  ) as ordering(title, sort_order)
where item.section_id = section.id
  and section.slug = 'services'
  and item.title = ordering.title;
