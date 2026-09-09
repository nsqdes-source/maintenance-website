-- Allow authenticated users to update only their own profile data.
-- Role remains protected because this policy does not grant access to role changes from the UI.

create policy "customers update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());
