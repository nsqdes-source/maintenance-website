create table public.site_settings (
 key text primary key check(key in ('logo_text','logo_image_url','primary_color','accent_color','header_cta_text')),
 value text not null,
 updated_at timestamptz not null default now(),
 constraint site_settings_color_check check(key not in ('primary_color','accent_color') or value ~ '^#[0-9A-Fa-f]{6}$')
);
create table public.site_sections (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check(slug in ('hero','services','why-us','works','contact')),
 eyebrow text,
 title text not null,
 description text,
 image_url text,
 sort_order integer not null default 0,
 is_visible boolean not null default true,
 updated_at timestamptz not null default now()
);
create table public.site_section_items (
 id uuid primary key default gen_random_uuid(),
 section_id uuid not null references public.site_sections(id) on delete cascade,
 title text not null,
 description text,
 image_url text,
 sort_order integer not null default 0,
 is_visible boolean not null default true,
 updated_at timestamptz not null default now()
);
create index site_sections_order_idx on public.site_sections(sort_order);
create index site_section_items_order_idx on public.site_section_items(section_id,sort_order);
alter table public.site_settings enable row level security;
alter table public.site_sections enable row level security;
alter table public.site_section_items enable row level security;
grant select on public.site_settings,public.site_sections,public.site_section_items to anon,authenticated;
grant insert,update,delete on public.site_settings,public.site_sections,public.site_section_items to authenticated;
create policy "public reads settings" on public.site_settings for select to anon,authenticated using(true);
create policy "admins edit settings" on public.site_settings for all to authenticated
using(public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]))
with check(public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));
create policy "public reads visible sections" on public.site_sections for select to anon,authenticated
using(is_visible or public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));
create policy "admins edit sections" on public.site_sections for all to authenticated
using(public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]))
with check(public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));
create policy "public reads visible items" on public.site_section_items for select to anon,authenticated
using((is_visible and exists(select 1 from public.site_sections s where s.id = section_id and s.is_visible))
 or public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));
create policy "admins edit items" on public.site_section_items for all to authenticated
using(public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]))
with check(public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));
insert into public.site_settings(key,value) values
('logo_text','خدمات الصيانة'),('logo_image_url',''),('primary_color','#0f766e'),
('accent_color','#f59e0b'),('header_cta_text','تسجيل الدخول');
insert into public.site_sections(slug,eyebrow,title,description,sort_order) values
('hero','صيانة منزلية ومنشآت','حلول صيانة موثوقة، عندما تحتاجها.','نقدم خدمات الصيانة العامة في الكهرباء والتكييف والسباكة والنجارة وغيرها، مع طريقة سهلة لإرسال طلبك ومتابعته.',0),
('services','خدماتنا','كل ما تحتاجه للصيانة في مكان واحد','خدمات أساسية للمنازل والمنشآت، مع إمكانية إضافة خدمات أخرى حسب احتياجك.',1),
('why-us','لماذا نحن؟','تجربة صيانة أبسط وأكثر وضوحًا','من أول طلب الخدمة حتى التواصل، صممنا التجربة لتكون مباشرة وسهلة.',2),
('works','أعمالنا','نماذج من الأعمال المنفذة','سيتم استبدال المساحات التالية بصور حقيقية من مشاريعكم عند توفرها.',3),
('contact','تواصل معنا','نحن هنا لخدمتك','يمكنك إرسال طلب الصيانة مباشرة من الموقع، وستتم متابعة الطلب والتواصل معك.',4);
insert into public.site_section_items(section_id,title,description,sort_order)
select s.id,v.title,v.description,v.sort_order from public.site_sections s
join (values
('services','الكهرباء','تمديدات، إصلاح أعطال، وتركيب وتجهيزات كهربائية.',0),
('services','التكييف','صيانة وتنظيف وإصلاح أجهزة التكييف للحفاظ على كفاءتها.',1),
('services','السباكة','معالجة التسريبات والأعطال وتركيب وإصلاح التمديدات الصحية.',2),
('services','النجارة','إصلاح وتركيب الأبواب والأثاث وأعمال النجارة المختلفة.',3),
('services','خدمات أخرى','أرسل تفاصيل احتياجك وسنساعدك في تحديد الخدمة المناسبة.',4),
('why-us','استجابة سريعة','نتعامل مع طلبك بوضوح ونرتب التواصل معك بأسرع وقت ممكن.',0),
('why-us','فنيون متخصصون','نحرص على توجيه كل طلب إلى الخدمة والفني المناسبين.',1),
('why-us','جودة في التنفيذ','نهتم بالتنفيذ المنظم ومعالجة المشكلة من جذورها قدر الإمكان.',2),
('why-us','طلب سهل','أرسل تفاصيل المشكلة والعنوان من نموذج واحد دون تعقيد.',3),
('works','أعمال كهربائية','إصلاح وتجهيزات كهربائية',0),
('works','صيانة تكييف','فحص وتنظيف وصيانة',1),
('works','أعمال سباكة','إصلاح التسريبات والأعطال',2)
) as v(slug,title,description,sort_order) on v.slug = s.slug;

-- Harden two legacy trigger helpers found by the local security advisor.
alter function public.set_technicians_updated_at() set search_path = public;
alter function public.set_site_footer_content_updated_at() set search_path = public;
revoke all on table public.site_settings,public.site_sections,public.site_section_items from public,anon,authenticated;
grant select on table public.site_settings,public.site_sections,public.site_section_items to anon,authenticated;
grant insert,update,delete on table public.site_settings,public.site_sections,public.site_section_items to authenticated;
