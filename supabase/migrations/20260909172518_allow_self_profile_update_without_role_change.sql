drop policy if exists "customers update own profile" on public.profiles;

create policy "customers update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));
