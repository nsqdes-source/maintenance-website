revoke execute on function public.current_user_has_role(public.app_role[]) from public, anon;
grant execute on function public.current_user_has_role(public.app_role[]) to authenticated;
