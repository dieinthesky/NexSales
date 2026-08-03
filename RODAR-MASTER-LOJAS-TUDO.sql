-- ============================================================
-- TUDO DE UMA VEZ (Master + Lojas + PIX da loja)
-- Cole este arquivo inteiro no SQL Editor do Supabase e rode.
-- Idempotente: pode rodar de novo se falhar no meio.
-- Não precisa rodar RODAR-STORE-PIX.sql separado.
-- ============================================================

-- 1) Enum master (se já existir, ignora)
alter type public.user_role add value if not exists 'master';

-- 2) Helpers
create or replace function public.is_master(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'master'::public.user_role
  );
$$;

grant execute on function public.is_master(uuid) to authenticated;

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id
      and role in ('admin'::public.user_role, 'master'::public.user_role)
  );
$$;

-- 3) admin_list_users (drop por causa do return type)
drop function if exists public.admin_list_users();

create function public.admin_list_users()
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
declare
  v_store uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- user_store_id pode ainda não existir neste ponto da 1ª execução parcial
  begin
    v_store := public.user_store_id();
  exception when undefined_function then
    v_store := null;
  end;

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
      case
        when public.is_master() then true
        when v_store is null then
          coalesce(r.role, 'employee'::public.user_role) <> 'master'::public.user_role
        else (
          coalesce(r.role, 'employee'::public.user_role) <> 'master'::public.user_role
          and exists (
            select 1 from public.store_members m
            where m.user_id = u.id and m.store_id = v_store
          )
        )
      end
    order by u.created_at desc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;

-- 4) admin_set_role
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

  if v_target_role = 'master'::public.user_role and not public.is_master() then
    raise exception 'cannot_modify_master' using errcode = 'P0001';
  end if;

  if p_role in ('admin'::public.user_role, 'master'::public.user_role)
     and not public.is_master() then
    raise exception 'only_master_can_grant_admin' using errcode = 'P0001';
  end if;

  if p_user_id = auth.uid()
     and public.is_master()
     and p_role <> 'master'::public.user_role then
    raise exception 'cannot_demote_self' using errcode = 'P0001';
  end if;

  if p_user_id = auth.uid()
     and not public.is_master()
     and p_role <> 'admin'::public.user_role then
    raise exception 'cannot_demote_self' using errcode = 'P0001';
  end if;

  insert into public.user_roles (user_id, role)
  values (p_user_id, p_role)
  on conflict (user_id) do update
    set role = excluded.role,
        updated_at = now();
end;
$$;

-- 5) Promove @admin → Master
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
    values (v_user_id, 'master'::public.user_role)
    on conflict (user_id) do update
      set role = 'master'::public.user_role,
          updated_at = now();
  end if;
end $$;

-- 6) Tabelas stores
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_template boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_stores_updated_at on public.stores;
create trigger trg_stores_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.user_role not null default 'employee'::public.user_role
    check (role in ('admin'::public.user_role, 'employee'::public.user_role)),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create unique index if not exists store_members_one_store_per_user_idx
  on public.store_members (user_id);

create index if not exists store_members_user_idx on public.store_members (user_id);

-- 7) Helpers de loja
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

create or replace function public.is_store_admin(
  p_store_id uuid default public.user_store_id(),
  p_user_id uuid default auth.uid()
)
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
        and m.role = 'admin'::public.user_role
    );
$$;

grant execute on function public.is_store_admin(uuid, uuid) to authenticated;

-- 8) Colunas store_id
alter table public.categories add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.products add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.sales add column if not exists store_id uuid references public.stores(id) on delete restrict;
alter table public.customers add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.debt_payments add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.report_recipients add column if not exists store_id uuid references public.stores(id) on delete cascade;

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
exception
  when duplicate_object then null;
  when undefined_column then null;
end $$;

-- 9) Seed lojas + backfill + Walter
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
    values (v_walter_store_id, v_walter_id, 'admin'::public.user_role)
    on conflict (store_id, user_id) do update
      set role = 'admin'::public.user_role;

    insert into public.user_roles (user_id, role)
    values (v_walter_id, 'admin'::public.user_role)
    on conflict (user_id) do update
      set role = 'admin'::public.user_role,
          updated_at = now()
    where public.user_roles.role is distinct from 'master'::public.user_role;
  end if;
end $$;

-- NOT NULL só se não houver nulls
do $$
begin
  if not exists (select 1 from public.categories where store_id is null) then
    alter table public.categories alter column store_id set not null;
  end if;
  if not exists (select 1 from public.products where store_id is null) then
    alter table public.products alter column store_id set not null;
  end if;
  if not exists (select 1 from public.sales where store_id is null) then
    alter table public.sales alter column store_id set not null;
  end if;
  if not exists (select 1 from public.customers where store_id is null) then
    alter table public.customers alter column store_id set not null;
  end if;
  if not exists (select 1 from public.debt_payments where store_id is null) then
    alter table public.debt_payments alter column store_id set not null;
  end if;
  if not exists (select 1 from public.report_recipients where store_id is null) then
    alter table public.report_recipients alter column store_id set not null;
  end if;
end $$;

create index if not exists categories_store_id_idx on public.categories (store_id);
create index if not exists products_store_id_idx on public.products (store_id);
create index if not exists sales_store_id_idx on public.sales (store_id);
create index if not exists customers_store_id_idx on public.customers (store_id);

-- 10) RLS
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

drop policy if exists "auth_read_categories" on public.categories;
drop policy if exists "auth_write_categories" on public.categories;
drop policy if exists "store_read_categories" on public.categories;
drop policy if exists "store_write_categories" on public.categories;
create policy "store_read_categories" on public.categories
  for select to authenticated
  using (public.can_access_store(store_id));
create policy "store_write_categories" on public.categories
  for all to authenticated
  using (public.is_store_admin(store_id) or public.is_master())
  with check (public.is_store_admin(store_id) or public.is_master());

drop policy if exists "auth_read_products" on public.products;
drop policy if exists "auth_write_products" on public.products;
drop policy if exists "store_read_products" on public.products;
drop policy if exists "store_write_products" on public.products;
create policy "store_read_products" on public.products
  for select to authenticated
  using (public.can_access_store(store_id));
create policy "store_write_products" on public.products
  for all to authenticated
  using (public.is_store_admin(store_id) or public.is_master())
  with check (public.is_store_admin(store_id) or public.is_master());

drop policy if exists "auth_read_sales" on public.sales;
drop policy if exists "owner_insert_sales" on public.sales;
drop policy if exists "store_read_sales" on public.sales;
drop policy if exists "store_insert_sales" on public.sales;
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
drop policy if exists "store_read_sale_items" on public.sale_items;
drop policy if exists "store_insert_sale_items" on public.sale_items;
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
drop policy if exists "store_read_sale_payments" on public.sale_payments;
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
drop policy if exists "store_read_customers" on public.customers;
drop policy if exists "store_write_customers" on public.customers;
create policy "store_read_customers" on public.customers
  for select to authenticated
  using (public.can_access_store(store_id));
create policy "store_write_customers" on public.customers
  for all to authenticated
  using (public.can_access_store(store_id))
  with check (public.can_access_store(store_id));

drop policy if exists "auth_read_debt_payments" on public.debt_payments;
drop policy if exists "auth_insert_debt_payments" on public.debt_payments;
drop policy if exists "store_read_debt_payments" on public.debt_payments;
drop policy if exists "store_insert_debt_payments" on public.debt_payments;
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
drop policy if exists "store_admin_report_recipients" on public.report_recipients;
create policy "store_admin_report_recipients" on public.report_recipients
  for all to authenticated
  using (public.is_store_admin(store_id) or public.is_master())
  with check (public.is_store_admin(store_id) or public.is_master());

-- Recria admin_list_users já com store_members garantido
drop function if exists public.admin_list_users();

create function public.admin_list_users()
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
      p.first_name,
      p.last_name,
      coalesce(r.role, 'employee'::public.user_role) as role,
      u.created_at,
      u.last_sign_in_at
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
    left join public.profiles p on p.user_id = u.id
    where
      case
        when public.is_master() then true
        else (
          coalesce(r.role, 'employee'::public.user_role) <> 'master'::public.user_role
          and exists (
            select 1 from public.store_members m
            where m.user_id = u.id and m.store_id = v_store
          )
        )
      end
    order by u.created_at desc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;

-- 11) RPCs de venda / provisionamento / fiado
create or replace function public.create_sale_with_items(
  p_payment_method public.payment_method,
  p_notes          text,
  p_items          jsonb,
  p_client_uuid    uuid default null,
  p_customer_id    uuid default null,
  p_payments       jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id     uuid;
  v_total       numeric(12,2) := 0;
  v_item        jsonb;
  v_product     record;
  v_qty         integer;
  v_unit_price  numeric(12,2);
  v_subtotal    numeric(12,2);
  v_item_desc   text;
  v_pay         jsonb;
  v_pay_sum     numeric(12,2) := 0;
  v_pay_method  public.payment_method;
  v_pay_amount  numeric(12,2);
  v_pay_count   integer := 0;
  v_header_method public.payment_method;
  v_store_id    uuid := public.user_store_id();
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  if v_store_id is null then
    raise exception 'store_required';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  if p_payment_method = 'fiado' and p_customer_id is null then
    raise exception 'customer_required';
  end if;

  if p_customer_id is not null then
    if not exists (
      select 1 from public.customers c
      where c.id = p_customer_id and c.store_id = v_store_id
    ) then
      raise exception 'customer_wrong_store';
    end if;
  end if;

  if p_client_uuid is not null then
    select id into v_sale_id
      from public.sales
     where client_uuid = p_client_uuid;
    if found then
      return v_sale_id;
    end if;
  end if;

  v_header_method := p_payment_method;

  insert into public.sales (total_amount, payment_method, notes, seller_id, client_uuid, customer_id, store_id)
  values (0, v_header_method, p_notes, auth.uid(), p_client_uuid, p_customer_id, v_store_id)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty       := (v_item->>'quantity')::integer;
    v_item_desc := v_item->>'item_description';

    select id, sale_price, stock_quantity, name, track_stock, store_id
      into v_product
      from public.products
     where id = (v_item->>'product_id')::uuid
       and is_active = true
       and store_id = v_store_id
     for update;

    if not found then
      raise exception 'product_not_found:%', (v_item->>'product_id');
    end if;

    if v_product.track_stock and v_product.stock_quantity < v_qty then
      raise exception 'insufficient_stock:%', v_product.name;
    end if;

    v_unit_price := coalesce(
      nullif((v_item->>'unit_price')::numeric, 0),
      v_product.sale_price
    );
    v_subtotal := v_unit_price * v_qty;
    v_total    := v_total + v_subtotal;

    insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal, item_description)
    values (v_sale_id, v_product.id, v_qty, v_unit_price, v_subtotal, v_item_desc);

    if v_product.track_stock then
      update public.products
         set stock_quantity = stock_quantity - v_qty
       where id = v_product.id;
    end if;
  end loop;

  if p_payments is not null and jsonb_typeof(p_payments) = 'array' and jsonb_array_length(p_payments) > 0 then
    for v_pay in select * from jsonb_array_elements(p_payments)
    loop
      v_pay_method := (v_pay->>'method')::public.payment_method;
      v_pay_amount := (v_pay->>'amount')::numeric;

      if v_pay_method::text = 'mixed' then
        raise exception 'invalid_payment';
      end if;
      if v_pay_amount is null or v_pay_amount <= 0 then
        raise exception 'invalid_payment';
      end if;
      if v_pay_method = 'fiado' and p_customer_id is null then
        raise exception 'customer_required';
      end if;

      insert into public.sale_payments (sale_id, payment_method, amount)
      values (v_sale_id, v_pay_method, v_pay_amount);

      v_pay_sum := v_pay_sum + v_pay_amount;
      v_pay_count := v_pay_count + 1;
    end loop;

    if abs(v_pay_sum - v_total) > 0.009 then
      raise exception 'payment_mismatch';
    end if;

    if v_pay_count > 1 then
      v_header_method := 'mixed';
    else
      select payment_method into v_header_method
        from public.sale_payments
       where sale_id = v_sale_id
       limit 1;
    end if;
  else
    insert into public.sale_payments (sale_id, payment_method, amount)
    values (v_sale_id, p_payment_method, v_total);
    v_header_method := p_payment_method;
  end if;

  update public.sales
     set total_amount = v_total,
         payment_method = v_header_method
   where id = v_sale_id;

  return v_sale_id;
end;
$$;

create or replace function public.master_provision_store(
  p_store_name text,
  p_store_slug text,
  p_owner_user_id uuid,
  p_copy_catalog boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_template_id uuid;
  v_cat record;
  v_prod record;
  v_new_cat_id uuid;
  v_cat_map jsonb := '{}'::jsonb;
begin
  if not public.is_master() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.stores (name, slug, is_template)
  values (trim(p_store_name), lower(trim(p_store_slug)), false)
  returning id into v_store_id;

  insert into public.store_members (store_id, user_id, role)
  values (v_store_id, p_owner_user_id, 'admin'::public.user_role)
  on conflict (store_id, user_id) do update
    set role = 'admin'::public.user_role;

  insert into public.user_roles (user_id, role)
  values (p_owner_user_id, 'admin'::public.user_role)
  on conflict (user_id) do update
    set role = 'admin'::public.user_role,
        updated_at = now()
  where public.user_roles.role is distinct from 'master'::public.user_role;

  if p_copy_catalog then
    select id into v_template_id from public.stores where is_template limit 1;
    if v_template_id is not null then
      for v_cat in select * from public.categories where store_id = v_template_id
      loop
        insert into public.categories (name, store_id)
        values (v_cat.name, v_store_id)
        on conflict (store_id, name) do update set name = excluded.name
        returning id into v_new_cat_id;
        if v_new_cat_id is null then
          select id into v_new_cat_id from public.categories
          where store_id = v_store_id and name = v_cat.name;
        end if;
        v_cat_map := v_cat_map || jsonb_build_object(v_cat.id::text, v_new_cat_id::text);
      end loop;

      for v_prod in select * from public.products where store_id = v_template_id and is_active
      loop
        insert into public.products (
          code, name, description, sale_price, cost_price,
          stock_quantity, min_stock, category_id, is_active, track_stock, image_url, store_id
        ) values (
          v_prod.code, v_prod.name, v_prod.description, v_prod.sale_price, v_prod.cost_price,
          0, v_prod.min_stock,
          case when v_prod.category_id is null then null
               else nullif(v_cat_map ->> v_prod.category_id::text, '')::uuid end,
          true, coalesce(v_prod.track_stock, true), v_prod.image_url, v_store_id
        )
        on conflict (store_id, code) do nothing;
      end loop;
    end if;
  end if;

  return v_store_id;
end;
$$;

grant execute on function public.master_provision_store(text, text, uuid, boolean) to authenticated;

create or replace function public.master_reset_store_operations(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_master() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.stores where id = p_store_id and is_template) then
    raise exception 'cannot_reset_template' using errcode = 'P0001';
  end if;

  delete from public.debt_payments where store_id = p_store_id;
  delete from public.sales where store_id = p_store_id;
end;
$$;

grant execute on function public.master_reset_store_operations(uuid) to authenticated;

create or replace function public.record_debt_payment(
  p_customer_id uuid,
  p_amount      numeric,
  p_notes       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_store uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  select store_id into v_store
  from public.customers
  where id = p_customer_id;

  if v_store is null then
    raise exception 'customer_not_found';
  end if;

  if not public.can_access_store(v_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.debt_payments (customer_id, amount, notes, recorded_by, store_id)
  values (p_customer_id, p_amount, p_notes, auth.uid(), v_store)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.record_debt_payment(uuid, numeric, text) to authenticated;

-- ============================================================
-- PIX da loja (QR / copia-e-cola no PDV)
-- ============================================================

alter table public.stores
  add column if not exists pix_key text,
  add column if not exists pix_merchant_name text,
  add column if not exists pix_merchant_city text;

comment on column public.stores.pix_key is 'Chave PIX (e-mail, telefone, CPF/CNPJ ou aleatória)';
comment on column public.stores.pix_merchant_name is 'Nome no payload EMV';
comment on column public.stores.pix_merchant_city is 'Cidade no payload EMV';

drop policy if exists "stores_admin_update" on public.stores;
create policy "stores_admin_update" on public.stores
  for update to authenticated
  using (public.is_store_admin(id) or public.is_master())
  with check (public.is_store_admin(id) or public.is_master());

notify pgrst, 'reload schema';
