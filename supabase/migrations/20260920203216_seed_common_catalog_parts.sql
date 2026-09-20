insert into public.service_catalog_parts(service_catalog_item_id,name,default_price,sort_order)
select service.id, part.name, 0, part.sort_order
from public.service_catalog_items service
join (values
 ('ac','كابستر',1),('ac','حساس حرارة',2),('ac','ريموت مكيف',3),('ac','محرك مروحة',4),('ac','لوحة تحكم',5),
 ('electrical','قاطع كهربائي',1),('electrical','مفتاح كهرباء',2),('electrical','مقبس كهرباء',3),('electrical','سلك كهربائي',4),
 ('plumbing','خلاط ماء',1),('plumbing','صمام مياه',2),('plumbing','سيفون',3),('plumbing','وصلة مرنة',4),
 ('carpentry','مفصلة باب',1),('carpentry','مقبض باب',2),('carpentry','قفل باب',3)
) as part(service_key,name,sort_order) on part.service_key=service.service_key
on conflict (service_catalog_item_id, lower(name)) do nothing;
