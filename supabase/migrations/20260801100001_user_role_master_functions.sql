-- Helpers + RPCs com hierarquia Master > Admin da loja > Funcionário.

create or replace function public.is_master(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'master'
  );
$$;

grant execute on function public.is_master(uuid) to authenticated;

-- Admin de gestão = admin da loja OU master da plataforma.
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role in ('admin', 'master')
  );
$$;

-- Lista usuários: store admin não vê contas master.
-- DROP: tipo de retorno já inclui first_name/last_name (migration profiles).
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

-- Alterar papel: só master promove admin/master; admin da loja só employee.
create or replace function public.admin_set_role(
  p_user_id uuid,
  p_role public.user_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role public.user_role;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select role into v_target_role
  from public.user_roles
  where user_id = p_user_id;

  -- Ninguém altera conta master, exceto outro master.
  if v_target_role = 'master' and not public.is_master() then
    raise exception 'cannot_modify_master' using errcode = 'P0001';
  end if;

  -- Store admin não pode atribuir admin/master.
  if p_role in ('admin', 'master') and not public.is_master() then
    raise exception 'only_master_can_grant_admin' using errcode = 'P0001';
  end if;

  -- Master não se rebaixa sozinho (lockout).
  if p_user_id = auth.uid() and public.is_master() and p_role <> 'master' then
    raise exception 'cannot_demote_self' using errcode = 'P0001';
  end if;

  -- Admin da loja não se rebaixa sozinho.
  if p_user_id = auth.uid()
     and not public.is_master()
     and p_role <> 'admin' then
    raise exception 'cannot_demote_self' using errcode = 'P0001';
  end if;

  insert into public.user_roles (user_id, role)
  values (p_user_id, p_role)
  on conflict (user_id) do update set role = excluded.role, updated_at = now();
end;
$$;

-- Promove a conta Master (login interno admin).
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
