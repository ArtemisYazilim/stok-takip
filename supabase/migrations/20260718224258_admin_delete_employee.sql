create or replace function public.admin_delete_employee(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz işlem';
  end if;
  if target_id = auth.uid() then
    raise exception 'Kendi hesabınızı silemezsiniz';
  end if;

  delete from public.stock_movements
  where profile_id = target_id
     or shift_id in (select id from public.shifts where profile_id = target_id);

  delete from public.shifts where profile_id = target_id;

  delete from auth.users where id = target_id;
end;
$$;

grant execute on function public.admin_delete_employee(uuid) to authenticated;
