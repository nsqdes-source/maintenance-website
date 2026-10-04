-- Fix public read policies so anonymous visitors can read only public/visible content
-- without requiring EXECUTE on current_user_has_role().
-- Admin visibility remains covered by the existing authenticated admin-manage policies.

alter policy "public reads visible sections"
on public.site_sections
to anon, authenticated
using (is_visible);

alter policy "public reads visible items"
on public.site_section_items
to anon, authenticated
using (
  is_visible
  and exists (
    select 1
    from public.site_sections s
    where s.id = site_section_items.section_id
      and s.is_visible
  )
);

alter policy "public reads visible catalog items"
on public.service_catalog_items
to anon, authenticated
using (is_visible);

alter policy "public reads active catalog services"
on public.service_catalog_services
to anon, authenticated
using (is_active);
