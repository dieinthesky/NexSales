-- Cole isto no SQL Editor do Supabase se a migration falhou no admin_list_users.
-- Depois continue com o restante de 20260801100001 (se ainda não rodou) e as migrations de lojas.

drop function if exists public.admin_list_users();

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  role public.user_role,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select
      u.id as user_id,
      u.email::text,
      p.first_name,
      p.last_name,
      coalesce(r.role, 'employee'::public.user_role) as role,
      u.created_at,
      u.last_sign_in_at
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
    left join public.profiles p on p.user_id = u.id
    where
      public.is_master()
      or coalesce(r.role, 'employee'::public.user_role) <> 'master'
    order by u.created_at desc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;

-- Garante Master na conta admin (se a parte de cima já tinha rodado parcialmente)
do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where email in ('admin@vendas-app.interno', 'admin@caixadobairro.interno')
  order by created_at
  limit 1;

  if v_user_id is not null then
    insert into public.user_roles (user_id, role)
    values (v_user_id, 'master')
    on conflict (user_id) do update set role = 'master', updated_at = now();
  end if;
end $$;
