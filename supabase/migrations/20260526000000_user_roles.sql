-- ============================================================
-- ROLES: controle de acesso admin x funcionario
-- ============================================================

create type public.user_role as enum ('admin', 'employee');

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'employee',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_user_roles_role on public.user_roles(role);

create trigger trg_user_roles_updated_at
  before update on public.user_roles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Helper: SECURITY DEFINER para verificar se o caller eh admin
-- (evita recursao infinita nas policies da propria tabela)
-- ------------------------------------------------------------
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin'
  );
$$;

grant execute on function public.is_admin(uuid) to authenticated;

-- ------------------------------------------------------------
-- RLS na propria user_roles
-- ------------------------------------------------------------
alter table public.user_roles enable row level security;

-- Cada usuario pode ler o proprio role; admins leem todos
create policy "self_or_admin_read_roles" on public.user_roles
  for select using (
    auth.uid() = user_id or public.is_admin()
  );

-- Apenas admins gerenciam roles
create policy "admin_insert_roles" on public.user_roles
  for insert with check (public.is_admin());

create policy "admin_update_roles" on public.user_roles
  for update using (public.is_admin()) with check (public.is_admin());

create policy "admin_delete_roles" on public.user_roles
  for delete using (public.is_admin());

-- ------------------------------------------------------------
-- Trigger: novos signups entram como 'employee' por padrao
-- ------------------------------------------------------------
create or replace function public.handle_new_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'employee')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_role();

-- ------------------------------------------------------------
-- Backfill: usuarios ja existentes viram employee por padrao
-- ------------------------------------------------------------
insert into public.user_roles (user_id, role)
select id, 'employee'::public.user_role
from auth.users
on conflict (user_id) do nothing;

-- ------------------------------------------------------------
-- RPC: listar usuarios + role (apenas admins)
-- Necessario porque auth.users nao e lida via RLS pelo anon client.
-- ------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
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
      coalesce(r.role, 'employee'::public.user_role) as role,
      u.created_at,
      u.last_sign_in_at
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
    order by u.created_at desc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;

-- ------------------------------------------------------------
-- RPC: alterar role de um usuario (apenas admins)
-- Bloqueia o admin de remover o proprio status pra evitar lockout.
-- ------------------------------------------------------------
create or replace function public.admin_set_role(
  p_user_id uuid,
  p_role public.user_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Nao permite o admin se rebaixar (evita lockout total caso seja o unico admin)
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'cannot_demote_self' using errcode = 'P0001';
  end if;

  insert into public.user_roles (user_id, role)
  values (p_user_id, p_role)
  on conflict (user_id) do update set role = excluded.role, updated_at = now();
end;
$$;

grant execute on function public.admin_set_role(uuid, public.user_role) to authenticated;

-- ------------------------------------------------------------
-- SEED DO PRIMEIRO ADMIN
-- ------------------------------------------------------------
-- Substitua o email abaixo pelo seu antes de rodar a migration,
-- OU rode manualmente depois:
--
--   update public.user_roles
--      set role = 'admin'
--    where user_id = (select id from auth.users where email = 'seu@email.com');
--
-- ------------------------------------------------------------
do $$
declare
  v_admin_email text := 'admin@vendas-app.interno';
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = v_admin_email;
  if v_user_id is not null then
    insert into public.user_roles (user_id, role)
    values (v_user_id, 'admin')
    on conflict (user_id) do update set role = 'admin';
  end if;
end $$;
