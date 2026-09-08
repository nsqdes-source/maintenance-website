-- Allow staff roles to read the directory data needed by the admin console.
-- No insert, update, or delete permissions are granted here.

DROP POLICY IF EXISTS "staff read all profiles" ON public.profiles;
CREATE POLICY "staff read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.current_user_has_role(
    ARRAY[
      'maintenance_manager'::public.app_role,
      'admin_manager'::public.app_role,
      'super_admin'::public.app_role
    ]
  )
  OR id = auth.uid()
);

DROP POLICY IF EXISTS "staff read technicians" ON public.technicians;
CREATE POLICY "staff read technicians"
ON public.technicians
FOR SELECT
TO authenticated
USING (
  public.current_user_has_role(
    ARRAY[
      'maintenance_manager'::public.app_role,
      'admin_manager'::public.app_role,
      'super_admin'::public.app_role
    ]
  )
);
