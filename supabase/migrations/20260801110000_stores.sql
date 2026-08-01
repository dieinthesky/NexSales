-- ============================================================
-- Multi-loja: stores + store_members + store_id + RLS
-- ============================================================

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_template boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_stores_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.user_role not null default 'employee'
    check (role in ('admin', 'employee')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create unique index if not exists store_members_one_store_per_user_idx
  on public.store_members (user_id);

create index if not exists store_members_user_idx on public.store_members (user_id);

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------
create or replace function public.user_store_id(p_user_id uuid default auth.uid())
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select store_id
  from public.store_members
  where user_id = p_user_id
  limit 1;
$$;

grant execute on function public.user_store_id(uuid) to authenticated;

create or replace function public.can_access_store(p_store_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_master(p_user_id)
    or exists (
      select 1 from public.store_members m
      where m.store_id = p_store_id and m.user_id = p_user_id
    );
$$;

grant execute on function public.can_access_store(uuid, uuid) to authenticated;

create or replace function public.is_store_admin(p_store_id uuid default public.user_store_id(), p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_master(p_user_id)
    or exists (
      select 1 from public.store_members m
      where m.store_id = p_store_id
        and m.user_id = p_user_id
        and m.role = 'admin'
    );
$$;

grant execute on function public.is_store_admin(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- Colunas store_id
-- ------------------------------------------------------------
alter table public.categories add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.products add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.sales add column if not exists store_id uuid references public.stores(id) on delete restrict;
alter table public.customers add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.debt_payments add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.report_recipients add column if not exists store_id uuid references public.stores(id) on delete cascade;

-- Libera nomes/códigos iguais em lojas diferentes ANTES de copiar o catálogo
alter table public.categories drop constraint if exists categories_name_key;
alter table public.products drop constraint if exists products_code_key;
alter table public.report_recipients drop constraint if exists report_recipients_email_key;

alter table public.categories drop constraint if exists categories_store_id_name_key;
alter table public.categories add constraint categories_store_id_name_key unique (store_id, name);

alter table public.products drop constraint if exists products_store_id_code_key;
alter table public.products add constraint products_store_id_code_key unique (store_id, code);

alter table public.report_recipients drop constraint if exists report_recipients_store_id_email_key;
do $$
begin
  alter table public.report_recipients
    add constraint report_recipients_store_id_email_key unique (store_id, email);
exception when duplicate_object then
  null;
when undefined_column then
  null;
end $$;

-- Seed lojas + backfill
do $$
declare
  v_template_id uuid;
  v_walter_store_id uuid;
  v_walter_id uuid;
  v_cat record;
  v_prod record;
  v_new_cat_id uuid;
  v_cat_map jsonb := '{}'::jsonb;
begin
  insert into public.stores (name, slug, is_template)
  values ('Catálogo modelo', 'catalogo-modelo', true)
  on conflict (slug) do update set name = excluded.name
  returning id into v_template_id;

  if v_template_id is null then
    select id into v_template_id from public.stores where slug = 'catalogo-modelo';
  end if;

  insert into public.stores (name, slug, is_template)
  values ('Mercadinho Walter', 'mercadinho-walter', false)
  on conflict (slug) do update set name = excluded.name
  returning id into v_walter_store_id;

  if v_walter_store_id is null then
    select id into v_walter_store_id from public.stores where slug = 'mercadinho-walter';
  end if;

  -- Dados atuais sem store → template (histórico fica no modelo; loja Walter nasce limpa de vendas)
  update public.categories set store_id = v_template_id where store_id is null;
  update public.products set store_id = v_template_id where store_id is null;
  update public.sales set store_id = v_template_id where store_id is null;
  update public.customers set store_id = v_template_id where store_id is null;
  update public.debt_payments dp
     set store_id = c.store_id
    from public.customers c
   where dp.customer_id = c.id and dp.store_id is null;
  update public.debt_payments set store_id = v_template_id where store_id is null;
  update public.report_recipients set store_id = v_walter_store_id where store_id is null;

  -- Copia catálogo template → loja Walter
  for v_cat in
    select * from public.categories where store_id = v_template_id
  loop
    insert into public.categories (name, store_id)
    values (v_cat.name, v_walter_store_id)
    on conflict (store_id, name) do update set name = excluded.name
    returning id into v_new_cat_id;

    if v_new_cat_id is null then
      select id into v_new_cat_id
      from public.categories
      where store_id = v_walter_store_id and name = v_cat.name;
    end if;

    v_cat_map := v_cat_map || jsonb_build_object(v_cat.id::text, v_new_cat_id::text);
  end loop;

  for v_prod in
    select * from public.products where store_id = v_template_id and is_active = true
  loop
    insert into public.products (
      code, name, description, sale_price, cost_price,
      stock_quantity, min_stock, category_id, is_active, track_stock, image_url, store_id
    )
    values (
      v_prod.code,
      v_prod.name,
      v_prod.description,
      v_prod.sale_price,
      v_prod.cost_price,
      v_prod.stock_quantity,
      v_prod.min_stock,
      case
        when v_prod.category_id is null then null
        else nullif(v_cat_map ->> v_prod.category_id::text, '')::uuid
      end,
      v_prod.is_active,
      coalesce(v_prod.track_stock, true),
      v_prod.image_url,
      v_walter_store_id
    )
    on conflict (store_id, code) do update set
      name = excluded.name,
      sale_price = excluded.sale_price,
      stock_quantity = excluded.stock_quantity,
      category_id = excluded.category_id,
      image_url = excluded.image_url;
  end loop;

  select id into v_walter_id
  from auth.users
  where email ilike '%walter%@vendas-app.interno'
     or email = 'mercadinhowalter@vendas-app.interno'
  order by created_at desc
  limit 1;

  if v_walter_id is not null then
    insert into public.store_members (store_id, user_id, role)
    values (v_walter_store_id, v_walter_id, 'admin')
    on conflict (store_id, user_id) do update set role = 'admin';

    insert into public.user_roles (user_id, role)
    values (v_walter_id, 'admin')
    on conflict (user_id) do update
      set role = case
        when public.user_roles.role = 'master' then 'master'
        else 'admin'
      end,
      updated_at = now();
  end if;
end $$;

alter table public.categories alter column store_id set not null;
alter table public.products alter column store_id set not null;
alter table public.sales alter column store_id set not null;
alter table public.customers alter column store_id set not null;
alter table public.debt_payments alter column store_id set not null;
alter table public.report_recipients alter column store_id set not null;

create index if not exists categories_store_id_idx on public.categories (store_id);
create index if not exists products_store_id_idx on public.products (store_id);
create index if not exists sales_store_id_idx on public.sales (store_id);
create index if not exists customers_store_id_idx on public.customers (store_id);

-- ------------------------------------------------------------
-- RLS stores / members
-- ------------------------------------------------------------
alter table public.stores enable row level security;
alter table public.store_members enable row level security;

drop policy if exists "stores_select" on public.stores;
create policy "stores_select" on public.stores
  for select to authenticated
  using (public.can_access_store(id) or is_template);

drop policy if exists "stores_master_write" on public.stores;
create policy "stores_master_write" on public.stores
  for all to authenticated
  using (public.is_master())
  with check (public.is_master());

drop policy if exists "store_members_select" on public.store_members;
create policy "store_members_select" on public.store_members
  for select to authenticated
  using (public.can_access_store(store_id));

drop policy if exists "store_members_admin_write" on public.store_members;
create policy "store_members_admin_write" on public.store_members
  for all to authenticated
  using (public.is_store_admin(store_id) or public.is_master())
  with check (public.is_store_admin(store_id) or public.is_master());

-- ------------------------------------------------------------
-- RLS tenant tables
-- ------------------------------------------------------------
drop policy if exists "auth_read_categories" on public.categories;
drop policy if exists "auth_write_categories" on public.categories;
create policy "store_read_categories" on public.categories
  for select to authenticated
  using (public.can_access_store(store_id));
create policy "store_write_categories" on public.categories
  for all to authenticated
  using (public.is_store_admin(store_id) or public.is_master())
  with check (public.is_store_admin(store_id) or public.is_master());

drop policy if exists "auth_read_products" on public.products;
drop policy if exists "auth_write_products" on public.products;
create policy "store_read_products" on public.products
  for select to authenticated
  using (public.can_access_store(store_id));
create policy "store_write_products" on public.products
  for all to authenticated
  using (public.is_store_admin(store_id) or public.is_master())
  with check (public.is_store_admin(store_id) or public.is_master());

drop policy if exists "auth_read_sales" on public.sales;
drop policy if exists "owner_insert_sales" on public.sales;
create policy "store_read_sales" on public.sales
  for select to authenticated
  using (public.can_access_store(store_id));
create policy "store_insert_sales" on public.sales
  for insert to authenticated
  with check (
    auth.uid() = seller_id
    and public.can_access_store(store_id)
  );

drop policy if exists "auth_read_sale_items" on public.sale_items;
drop policy if exists "owner_insert_sale_items" on public.sale_items;
create policy "store_read_sale_items" on public.sale_items
  for select to authenticated
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_id and public.can_access_store(s.store_id)
    )
  );
create policy "store_insert_sale_items" on public.sale_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.sales s
      where s.id = sale_id
        and s.seller_id = auth.uid()
        and public.can_access_store(s.store_id)
    )
  );

drop policy if exists "sale_payments_select_authenticated" on public.sale_payments;
create policy "store_read_sale_payments" on public.sale_payments
  for select to authenticated
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_id and public.can_access_store(s.store_id)
    )
  );

drop policy if exists "auth_read_customers" on public.customers;
drop policy if exists "auth_write_customers" on public.customers;
create policy "store_read_customers" on public.customers
  for select to authenticated
  using (public.can_access_store(store_id));
create policy "store_write_customers" on public.customers
  for all to authenticated
  using (public.can_access_store(store_id))
  with check (public.can_access_store(store_id));

drop policy if exists "auth_read_debt_payments" on public.debt_payments;
drop policy if exists "auth_insert_debt_payments" on public.debt_payments;
create policy "store_read_debt_payments" on public.debt_payments
  for select to authenticated
  using (public.can_access_store(store_id));
create policy "store_insert_debt_payments" on public.debt_payments
  for insert to authenticated
  with check (
    auth.uid() = recorded_by
    and public.can_access_store(store_id)
  );

drop policy if exists "admin_read_report_recipients" on public.report_recipients;
drop policy if exists "admin_insert_report_recipients" on public.report_recipients;
drop policy if exists "admin_update_report_recipients" on public.report_recipients;
drop policy if exists "admin_delete_report_recipients" on public.report_recipients;
create policy "store_admin_report_recipients" on public.report_recipients
  for all to authenticated
  using (public.is_store_admin(store_id) or public.is_master())
  with check (public.is_store_admin(store_id) or public.is_master());

-- Lista usuários da mesma loja (master vê todos não-master + masters)
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
declare
  v_store uuid := public.user_store_id();
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
    where
      case
        when public.is_master() then true
        else (
          coalesce(r.role, 'employee') <> 'master'
          and exists (
            select 1 from public.store_members m
            where m.user_id = u.id and m.store_id = v_store
          )
        )
      end
    order by u.created_at desc;
end;
$$;
