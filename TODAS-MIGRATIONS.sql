-- CaixaDoBairro: rode este arquivo INTEIRO uma vez no SQL Editor do projeto NEXUS CAIXA
-- Gerado automaticamente — nao misturar com o projeto do Fiado


-- ════════════════════════════════════════
-- FILE: 001_initial_schema.sql
-- ════════════════════════════════════════

-- Extensions
create extension if not exists "uuid-ossp";

-- ============ CATEGORIES ============
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ============ PRODUCTS ============
create table public.products (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  description text,
  sale_price numeric(12,2) not null check (sale_price >= 0),
  cost_price numeric(12,2) not null check (cost_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  category_id uuid references public.categories(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_products_code on public.products(code);
create index idx_products_category on public.products(category_id);
create index idx_products_low_stock on public.products(stock_quantity)
  where stock_quantity <= min_stock;
create index idx_products_active on public.products(is_active);

-- Trigger updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ============ SALES ============
create type public.payment_method as enum ('cash','credit','debit','pix');

create table public.sales (
  id uuid primary key default uuid_generate_v4(),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  payment_method public.payment_method not null,
  notes text,
  seller_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index idx_sales_seller on public.sales(seller_id);
create index idx_sales_created_at on public.sales(created_at desc);

-- ============ SALE ITEMS ============
create table public.sale_items (
  id uuid primary key default uuid_generate_v4(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  subtotal numeric(12,2) not null check (subtotal >= 0)
);

create index idx_sale_items_sale on public.sale_items(sale_id);
create index idx_sale_items_product on public.sale_items(product_id);

-- ============ RPC: Criacao atomica de venda ============
create or replace function public.create_sale_with_items(
  p_payment_method public.payment_method,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_total   numeric(12,2) := 0;
  v_item    jsonb;
  v_product record;
  v_qty     integer;
  v_subtotal numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  -- Cria a venda com total 0 (atualizado ao final)
  insert into public.sales (total_amount, payment_method, notes, seller_id)
  values (0, p_payment_method, p_notes, auth.uid())
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;

    select id, sale_price, stock_quantity, name
      into v_product
      from public.products
     where id = (v_item->>'product_id')::uuid
       and is_active = true
     for update; -- lock para evitar race condition

    if not found then
      raise exception 'product_not_found:%', (v_item->>'product_id');
    end if;

    if v_product.stock_quantity < v_qty then
      raise exception 'insufficient_stock:%', v_product.name;
    end if;

    v_subtotal := v_product.sale_price * v_qty;
    v_total    := v_total + v_subtotal;

    insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal)
    values (v_sale_id, v_product.id, v_qty, v_product.sale_price, v_subtotal);

    update public.products
       set stock_quantity = stock_quantity - v_qty
     where id = v_product.id;
  end loop;

  update public.sales set total_amount = v_total where id = v_sale_id;

  return v_sale_id;
end;
$$;

-- ============ RLS ============
alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.sales      enable row level security;
alter table public.sale_items enable row level security;

-- Categories: qualquer autenticado pode ler e escrever
create policy "auth_read_categories" on public.categories
  for select using (auth.uid() is not null);
create policy "auth_write_categories" on public.categories
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Products: qualquer autenticado pode ler e escrever
create policy "auth_read_products" on public.products
  for select using (auth.uid() is not null);
create policy "auth_write_products" on public.products
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Sales: qualquer autenticado le, apenas dono insere
create policy "auth_read_sales" on public.sales
  for select using (auth.uid() is not null);
create policy "owner_insert_sales" on public.sales
  for insert with check (auth.uid() = seller_id);

-- Sale items: qualquer autenticado le, insere se venda e do usuario
create policy "auth_read_sale_items" on public.sale_items
  for select using (auth.uid() is not null);
create policy "owner_insert_sale_items" on public.sale_items
  for insert with check (
    exists (
      select 1 from public.sales s
      where s.id = sale_id and s.seller_id = auth.uid()
    )
  );

-- Seed: categorias iniciais
insert into public.categories (name) values
  ('Geral'),
  ('Alimentos'),
  ('Bebidas'),
  ('Limpeza'),
  ('Higiene'),
  ('Eletrônicos'),
  ('Vestuário'),
  ('Outros');

;

-- ════════════════════════════════════════
-- FILE: 20260525000000_barcode_cache.sql
-- ════════════════════════════════════════

-- Barcode cache table: stores results of external barcode-database lookups
-- so the same code is never queried twice against Cosmos/OpenFoodFacts/UPCitemdb.

create table if not exists public.barcode_cache (
  code text primary key,
  source text not null check (source in ('cosmos', 'openfoodfacts', 'upcitemdb', 'not_found')),
  name text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists barcode_cache_source_idx on public.barcode_cache (source);
create index if not exists barcode_cache_created_at_idx on public.barcode_cache (created_at desc);

alter table public.barcode_cache enable row level security;

-- Anyone may read the cache (it speeds up product lookup)
drop policy if exists "barcode_cache_select_all" on public.barcode_cache;
create policy "barcode_cache_select_all"
  on public.barcode_cache
  for select
  using (true);

-- Only authenticated users may insert/update cache entries
drop policy if exists "barcode_cache_insert_authenticated" on public.barcode_cache;
create policy "barcode_cache_insert_authenticated"
  on public.barcode_cache
  for insert
  to authenticated
  with check (true);

drop policy if exists "barcode_cache_update_authenticated" on public.barcode_cache;
create policy "barcode_cache_update_authenticated"
  on public.barcode_cache
  for update
  to authenticated
  using (true)
  with check (true);

-- Auto-update updated_at on row updates
create or replace function public.touch_barcode_cache_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists barcode_cache_set_updated_at on public.barcode_cache;
create trigger barcode_cache_set_updated_at
  before update on public.barcode_cache
  for each row execute function public.touch_barcode_cache_updated_at();

;

-- ════════════════════════════════════════
-- FILE: 20260526000000_user_roles.sql
-- ════════════════════════════════════════

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

;

-- ════════════════════════════════════════
-- FILE: 20260527000000_profiles.sql
-- ════════════════════════════════════════

-- ============================================================
-- PROFILES: nome + sobrenome dos usuarios
-- ============================================================

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

-- Qualquer autenticado pode ler perfis (necessario pra mostrar
-- nome do vendedor em vendas, lista de usuarios, etc.)
create policy "auth_read_profiles" on public.profiles
  for select using (auth.uid() is not null);

-- Usuario pode criar/atualizar o proprio perfil. Admins podem tudo.
create policy "self_or_admin_insert_profile" on public.profiles
  for insert with check (
    auth.uid() = user_id or public.is_admin()
  );

create policy "self_or_admin_update_profile" on public.profiles
  for update using (
    auth.uid() = user_id or public.is_admin()
  ) with check (
    auth.uid() = user_id or public.is_admin()
  );

create policy "admin_delete_profile" on public.profiles
  for delete using (public.is_admin());

-- ------------------------------------------------------------
-- Trigger: criar profile automaticamente no signup
-- Pega first_name / last_name do raw_user_meta_data se vierem.
-- Blindado contra falhas (nao trava o signup).
-- ------------------------------------------------------------
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (user_id, first_name, last_name)
    values (
      new.id,
      nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), ''),
      nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), '')
    )
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'handle_new_user_profile failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create trigger trg_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- Backfill: cria profile vazio pra usuarios existentes (UI cai pro email)
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ------------------------------------------------------------
-- Atualiza admin_list_users pra retornar first_name + last_name.
-- DROP necessario porque o tipo de retorno mudou (Postgres nao
-- permite mudar return type via CREATE OR REPLACE).
-- ------------------------------------------------------------
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
    order by u.created_at desc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;

;

-- ════════════════════════════════════════
-- FILE: 20260528000000_cancel_sale.sql
-- ════════════════════════════════════════

-- ============================================================
-- RPC: cancelar venda (apenas admins)
-- Devolve cada item ao estoque e apaga a venda atomicamente.
-- sale_items e apagado via cascata pela FK.
-- ============================================================

create or replace function public.cancel_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_exists boolean;
begin
  -- Autorizacao: apenas admins podem cancelar vendas
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Confirma que a venda existe (mensagem amigavel se nao)
  select exists(select 1 from public.sales where id = p_sale_id) into v_exists;
  if not v_exists then
    raise exception 'sale_not_found' using errcode = 'P0001';
  end if;

  -- 1. Devolve cada item ao estoque do produto correspondente.
  --    FOR UPDATE para evitar race com PDV concorrente alterando estoque.
  for v_item in
    select si.product_id, si.quantity
      from public.sale_items si
      join public.products p on p.id = si.product_id
     where si.sale_id = p_sale_id
       for update of p
  loop
    update public.products
       set stock_quantity = stock_quantity + v_item.quantity
     where id = v_item.product_id;
  end loop;

  -- 2. Apaga a venda. sale_items cai em cascata via FK.
  delete from public.sales where id = p_sale_id;
end;
$$;

grant execute on function public.cancel_sale(uuid) to authenticated;

;

-- ════════════════════════════════════════
-- FILE: 20260603000000_offline_sales.sql
-- ════════════════════════════════════════

-- ============================================================
-- Vendas offline: idempotência por client_uuid
--
-- O PDV pode registrar vendas offline e enfileirá-las localmente
-- (IndexedDB). Ao reconectar, a fila é reenviada ao servidor. Para que um
-- reenvio (após falha parcial de rede) não duplique a venda, o cliente gera
-- um UUID por venda e o servidor o trata como chave de idempotência.
-- ============================================================

-- Coluna nullable: vendas online tradicionais não precisam preencher.
-- UNIQUE garante que o mesmo client_uuid nunca crie duas vendas.
alter table public.sales
  add column if not exists client_uuid uuid;

create unique index if not exists sales_client_uuid_key
  on public.sales(client_uuid)
  where client_uuid is not null;

-- Recria a RPC com o parâmetro p_client_uuid. A assinatura muda (4 args),
-- então removemos a versão antiga (3 args) antes de criar a nova.
drop function if exists public.create_sale_with_items(public.payment_method, text, jsonb);

create or replace function public.create_sale_with_items(
  p_payment_method public.payment_method,
  p_notes text,
  p_items jsonb,
  p_client_uuid uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_total   numeric(12,2) := 0;
  v_item    jsonb;
  v_product record;
  v_qty     integer;
  v_subtotal numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  -- Idempotência: se essa venda (client_uuid) já foi gravada, devolve o id
  -- existente em vez de criar outra. Permite reenviar a fila com segurança.
  if p_client_uuid is not null then
    select id into v_sale_id
      from public.sales
     where client_uuid = p_client_uuid;
    if found then
      return v_sale_id;
    end if;
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  -- Cria a venda com total 0 (atualizado ao final)
  insert into public.sales (total_amount, payment_method, notes, seller_id, client_uuid)
  values (0, p_payment_method, p_notes, auth.uid(), p_client_uuid)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;

    select id, sale_price, stock_quantity, name
      into v_product
      from public.products
     where id = (v_item->>'product_id')::uuid
       and is_active = true
     for update; -- lock para evitar race condition

    if not found then
      raise exception 'product_not_found:%', (v_item->>'product_id');
    end if;

    if v_product.stock_quantity < v_qty then
      raise exception 'insufficient_stock:%', v_product.name;
    end if;

    v_subtotal := v_product.sale_price * v_qty;
    v_total    := v_total + v_subtotal;

    insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal)
    values (v_sale_id, v_product.id, v_qty, v_product.sale_price, v_subtotal);

    update public.products
       set stock_quantity = stock_quantity - v_qty
     where id = v_product.id;
  end loop;

  update public.sales set total_amount = v_total where id = v_sale_id;

  return v_sale_id;
end;
$$;

grant execute on function
  public.create_sale_with_items(public.payment_method, text, jsonb, uuid)
  to authenticated;

;

-- ════════════════════════════════════════
-- FILE: 20260609000000_report_recipients.sql
-- ════════════════════════════════════════

-- ============================================================
-- REPORT RECIPIENTS: destinatarios do relatorio diario por email
-- ============================================================
-- Permite ao admin gerenciar (pela UI) quem recebe o relatorio de
-- fechamento de caixa, sem depender exclusivamente da env REPORT_EMAIL.
-- A resolucao final mescla: admins com email real + REPORT_EMAIL + esta tabela.

create table public.report_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_report_recipients_active on public.report_recipients(active);

-- ------------------------------------------------------------
-- RLS: apenas admins gerenciam e leem destinatarios.
-- O cron usa o service-role client (bypassa RLS), entao continua lendo.
-- Reaproveita o helper is_admin() definido na migration de user_roles.
-- ------------------------------------------------------------
alter table public.report_recipients enable row level security;

create policy "admin_read_report_recipients" on public.report_recipients
  for select using (public.is_admin());

create policy "admin_insert_report_recipients" on public.report_recipients
  for insert with check (public.is_admin());

create policy "admin_update_report_recipients" on public.report_recipients
  for update using (public.is_admin()) with check (public.is_admin());

create policy "admin_delete_report_recipients" on public.report_recipients
  for delete using (public.is_admin());

;

-- ════════════════════════════════════════
-- FILE: 20260611000000_fiado.sql
-- ════════════════════════════════════════

-- ============ FIADO — crédito de loja ============

-- 1. Novo valor no enum de método de pagamento
alter type public.payment_method add value 'fiado';

-- 2. Tabela de clientes (pré-cadastro simples)
create table public.customers (
  id         uuid primary key default uuid_generate_v4(),
  full_name  text not null,
  phone      text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create index idx_customers_full_name on public.customers(lower(full_name));
create index idx_customers_phone     on public.customers(phone);

-- 3. Tabela de pagamentos de dívida (quitação parcial ou total)
create table public.debt_payments (
  id          uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  amount      numeric(12,2) not null check (amount > 0),
  notes       text,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at  timestamptz not null default now()
);

create index idx_debt_payments_customer on public.debt_payments(customer_id);
create index idx_debt_payments_created  on public.debt_payments(created_at desc);

-- 4. customer_id em sales (nullable — obrigatório apenas quando payment_method = 'fiado')
alter table public.sales
  add column customer_id uuid references public.customers(id) on delete set null;

create index idx_sales_customer on public.sales(customer_id);

-- 5. Atualiza a RPC de criação de venda para aceitar customer_id
create or replace function public.create_sale_with_items(
  p_payment_method public.payment_method,
  p_notes          text,
  p_items          jsonb,
  p_client_uuid    uuid default null,
  p_customer_id    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id  uuid;
  v_total    numeric(12,2) := 0;
  v_item     jsonb;
  v_product  record;
  v_qty      integer;
  v_subtotal numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  if p_payment_method = 'fiado' and p_customer_id is null then
    raise exception 'customer_required';
  end if;

  -- Idempotência: se o client_uuid já existe, devolve o id existente
  if p_client_uuid is not null then
    select id into v_sale_id
      from public.sales
     where client_uuid = p_client_uuid;
    if found then
      return v_sale_id;
    end if;
  end if;

  insert into public.sales (total_amount, payment_method, notes, seller_id, client_uuid, customer_id)
  values (0, p_payment_method, p_notes, auth.uid(), p_client_uuid, p_customer_id)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;

    select id, sale_price, stock_quantity, name
      into v_product
      from public.products
     where id = (v_item->>'product_id')::uuid
       and is_active = true
     for update;

    if not found then
      raise exception 'product_not_found:%', (v_item->>'product_id');
    end if;

    if v_product.stock_quantity < v_qty then
      raise exception 'insufficient_stock:%', v_product.name;
    end if;

    v_subtotal := v_product.sale_price * v_qty;
    v_total    := v_total + v_subtotal;

    insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal)
    values (v_sale_id, v_product.id, v_qty, v_product.sale_price, v_subtotal);

    update public.products
       set stock_quantity = stock_quantity - v_qty
     where id = v_product.id;
  end loop;

  update public.sales set total_amount = v_total where id = v_sale_id;

  return v_sale_id;
end;
$$;

-- 6. RPC: busca de clientes por nome ou telefone
create or replace function public.search_customers(p_query text)
returns setof public.customers
language sql
security definer
set search_path = public
as $$
  select * from public.customers
  where lower(full_name) like '%' || lower(p_query) || '%'
     or phone like '%' || p_query || '%'
  order by full_name
  limit 20;
$$;

-- 7. RPC: registrar pagamento de dívida
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
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  insert into public.debt_payments (customer_id, amount, notes, recorded_by)
  values (p_customer_id, p_amount, p_notes, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- 8. View: saldo devedor por cliente
create or replace view public.customer_balances as
select
  c.id,
  c.full_name,
  c.phone,
  c.notes,
  c.created_at,
  c.updated_at,
  coalesce(sum(s.total_amount) filter (where s.payment_method = 'fiado'), 0) as total_fiado,
  coalesce(sum(dp.amount), 0) as total_paid,
  coalesce(sum(s.total_amount) filter (where s.payment_method = 'fiado'), 0)
    - coalesce(sum(dp.amount), 0) as current_debt
from public.customers c
left join public.sales s on s.customer_id = c.id
left join public.debt_payments dp on dp.customer_id = c.id
group by c.id, c.full_name, c.phone, c.notes, c.created_at, c.updated_at;

-- 9. RLS
alter table public.customers     enable row level security;
alter table public.debt_payments  enable row level security;

create policy "auth_read_customers" on public.customers
  for select using (auth.uid() is not null);
create policy "auth_write_customers" on public.customers
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "auth_read_debt_payments" on public.debt_payments
  for select using (auth.uid() is not null);
create policy "auth_insert_debt_payments" on public.debt_payments
  for insert with check (auth.uid() = recorded_by);

;

-- ════════════════════════════════════════
-- FILE: 20260615000000_customer_balances_v2.sql
-- ════════════════════════════════════════

-- Adiciona first_fiado_at e last_payment_at à view customer_balances.
--
-- first_fiado_at: data da primeira compra fiada do cliente.
--   Usado para calcular "dias sem pagar" quando o cliente ainda nunca pagou,
--   evitando o texto genérico "Nunca pagou" para compradores recentes.
--
-- last_payment_at: data do último pagamento registrado.
--   Já existia em produção; incluída aqui para manter a migration em sincronia
--   com o schema real.

create or replace view public.customer_balances as
select
  c.id,
  c.full_name,
  c.phone,
  c.notes,
  c.created_at,
  c.updated_at,
  coalesce(sum(s.total_amount) filter (where s.payment_method = 'fiado'), 0) as total_fiado,
  coalesce(sum(dp.amount), 0) as total_paid,
  coalesce(sum(s.total_amount) filter (where s.payment_method = 'fiado'), 0)
    - coalesce(sum(dp.amount), 0) as current_debt,
  max(dp.created_at) as last_payment_at,
  min(s.created_at) filter (where s.payment_method = 'fiado') as first_fiado_at
from public.customers c
left join public.sales s on s.customer_id = c.id
left join public.debt_payments dp on dp.customer_id = c.id
group by c.id, c.full_name, c.phone, c.notes, c.created_at, c.updated_at;

;

-- ════════════════════════════════════════
-- FILE: 20260615000001_price_override.sql
-- ════════════════════════════════════════

-- Allow per-item price override in create_sale_with_items.
-- If the JSON item contains "unit_price", that value is used instead of the
-- product's catalogue price. Useful for promotions or corrections at the POS.
create or replace function public.create_sale_with_items(
  p_payment_method public.payment_method,
  p_notes          text,
  p_items          jsonb,
  p_client_uuid    uuid default null,
  p_customer_id    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id   uuid;
  v_total     numeric(12,2) := 0;
  v_item      jsonb;
  v_product   record;
  v_qty       integer;
  v_unit_price numeric(12,2);
  v_subtotal  numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  if p_payment_method = 'fiado' and p_customer_id is null then
    raise exception 'customer_required';
  end if;

  -- Idempotência: se o client_uuid já existe, devolve o id existente
  if p_client_uuid is not null then
    select id into v_sale_id
      from public.sales
     where client_uuid = p_client_uuid;
    if found then
      return v_sale_id;
    end if;
  end if;

  insert into public.sales (total_amount, payment_method, notes, seller_id, client_uuid, customer_id)
  values (0, p_payment_method, p_notes, auth.uid(), p_client_uuid, p_customer_id)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;

    select id, sale_price, stock_quantity, name
      into v_product
      from public.products
     where id = (v_item->>'product_id')::uuid
       and is_active = true
     for update;

    if not found then
      raise exception 'product_not_found:%', (v_item->>'product_id');
    end if;

    if v_product.stock_quantity < v_qty then
      raise exception 'insufficient_stock:%', v_product.name;
    end if;

    -- Use the override price when provided, otherwise fall back to catalogue price
    v_unit_price := coalesce(
      nullif((v_item->>'unit_price')::numeric, 0),
      v_product.sale_price
    );
    v_subtotal := v_unit_price * v_qty;
    v_total    := v_total + v_subtotal;

    insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal)
    values (v_sale_id, v_product.id, v_qty, v_unit_price, v_subtotal);

    update public.products
       set stock_quantity = stock_quantity - v_qty
     where id = v_product.id;
  end loop;

  update public.sales set total_amount = v_total where id = v_sale_id;

  return v_sale_id;
end;
$$;

;

-- ════════════════════════════════════════
-- FILE: 20260615000002_fix_customer_balances_cartesian.sql
-- ════════════════════════════════════════

-- Fix customer_balances view: cartesian product bug.
--
-- The previous version joined customers → sales → debt_payments directly,
-- creating N×M rows (N=fiado sales, M=payments). This caused both aggregates
-- to be multiplied by the wrong factor, so:
--   - 1 sale + 2 payments → total_fiado doubled (debt appeared to grow)
--   - 2 sales + 1 payment → total_paid doubled (debt appeared too low)
--
-- Fix: pre-aggregate each table independently in subqueries, then join
-- the already-collapsed rows. Each customer maps to at most one row per
-- subquery, eliminating the cross-multiplication.

create or replace view public.customer_balances as
select
  c.id,
  c.full_name,
  c.phone,
  c.notes,
  c.created_at,
  c.updated_at,
  coalesce(s.total_fiado,  0)                          as total_fiado,
  coalesce(dp.total_paid,  0)                          as total_paid,
  coalesce(s.total_fiado,  0) - coalesce(dp.total_paid, 0) as current_debt,
  dp.last_payment_at,
  s.first_fiado_at
from public.customers c
left join (
  select
    customer_id,
    sum(total_amount)  as total_fiado,
    min(created_at)    as first_fiado_at
  from public.sales
  where payment_method = 'fiado'
  group by customer_id
) s  on s.customer_id  = c.id
left join (
  select
    customer_id,
    sum(amount)        as total_paid,
    max(created_at)    as last_payment_at
  from public.debt_payments
  group by customer_id
) dp on dp.customer_id = c.id;

;

-- ════════════════════════════════════════
-- FILE: 20260615000003_fix_price_override_nullif.sql
-- ════════════════════════════════════════

-- Fix price override logic in create_sale_with_items.
--
-- Previous version used NULLIF(..., 0) which silently converts a legitimate
-- R$ 0.00 price to the catalogue price. Since the frontend only includes the
-- "unit_price" key when the cashier sets a custom price (never for default),
-- the correct contract is: use the provided price when the key EXISTS in the
-- JSON object, otherwise fall back to the catalogue price.

create or replace function public.create_sale_with_items(
  p_payment_method public.payment_method,
  p_notes          text,
  p_items          jsonb,
  p_client_uuid    uuid default null,
  p_customer_id    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id    uuid;
  v_total      numeric(12,2) := 0;
  v_item       jsonb;
  v_product    record;
  v_qty        integer;
  v_unit_price numeric(12,2);
  v_subtotal   numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  if p_payment_method = 'fiado' and p_customer_id is null then
    raise exception 'customer_required';
  end if;

  -- Idempotência: se o client_uuid já existe, devolve o id existente
  if p_client_uuid is not null then
    select id into v_sale_id
      from public.sales
     where client_uuid = p_client_uuid;
    if found then
      return v_sale_id;
    end if;
  end if;

  insert into public.sales (total_amount, payment_method, notes, seller_id, client_uuid, customer_id)
  values (0, p_payment_method, p_notes, auth.uid(), p_client_uuid, p_customer_id)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;

    select id, sale_price, stock_quantity, name
      into v_product
      from public.products
     where id = (v_item->>'product_id')::uuid
       and is_active = true
     for update;

    if not found then
      raise exception 'product_not_found:%', (v_item->>'product_id');
    end if;

    if v_product.stock_quantity < v_qty then
      raise exception 'insufficient_stock:%', v_product.name;
    end if;

    -- Use provided price only when the key is present in the JSON;
    -- fall back to the catalogue price otherwise.
    v_unit_price := case
      when v_item ? 'unit_price' then (v_item->>'unit_price')::numeric
      else v_product.sale_price
    end;

    v_subtotal := v_unit_price * v_qty;
    v_total    := v_total + v_subtotal;

    insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal)
    values (v_sale_id, v_product.id, v_qty, v_unit_price, v_subtotal);

    update public.products
       set stock_quantity = stock_quantity - v_qty
     where id = v_product.id;
  end loop;

  update public.sales set total_amount = v_total where id = v_sale_id;

  return v_sale_id;
end;
$$;

;

-- ════════════════════════════════════════
-- FILE: 20260623000000_barcode_cache_cleanup.sql
-- ════════════════════════════════════════

-- Barcode cache TTL cleanup
--
-- Adds last_accessed_at to track when a cached entry was last queried
-- (separate from updated_at which only changes on writes/upserts).
-- A cleanup function removes stale entries on a schedule.

alter table public.barcode_cache
  add column if not exists last_accessed_at timestamptz not null default now();

create index if not exists barcode_cache_last_accessed_idx
  on public.barcode_cache (last_accessed_at);

/**
 * Deletes stale barcode cache entries:
 *   - 'not_found' entries not accessed in 30 days
 *     (the product may have been added to an external DB in the meantime)
 *   - Any other entry not accessed in 90 days
 *
 * Returns the number of deleted rows. Called from the daily cron.
 */
create or replace function public.cleanup_barcode_cache()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.barcode_cache
  where
    (source = 'not_found' and last_accessed_at < now() - interval '30 days')
    or (last_accessed_at < now() - interval '90 days');

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

;

-- ════════════════════════════════════════
-- FILE: 20260623000001_track_stock.sql
-- ════════════════════════════════════════

-- Add track_stock to products: when false, the RPC skips stock checks and
-- deduction — useful for services, custom-priced items, or avulso products.
-- Add item_description to sale_items: stores a per-line description entered
-- at the POS for generic (avulso) items.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_stock boolean NOT NULL DEFAULT true;

-- System product for custom-price items without a barcode.
-- ON CONFLICT ensures re-running the migration is safe and keeps the product active.
INSERT INTO public.products (code, name, description, sale_price, cost_price, stock_quantity, min_stock, track_stock, is_active)
VALUES (
  'AVULSO',
  'Item Avulso',
  'Produto genérico para itens sem código ou com preço variável.',
  0, 0, 0, 0, false, true
)
ON CONFLICT (code) DO UPDATE
  SET track_stock = false,
      is_active   = true;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS item_description text;

-- Recreate create_sale_with_items with track_stock and item_description support.
--   • track_stock = false  → skip stock check and deduction for that product
--   • item_description     → stored in sale_items; read by receipts/reports
CREATE OR REPLACE FUNCTION public.create_sale_with_items(
  p_payment_method public.payment_method,
  p_notes          text,
  p_items          jsonb,
  p_client_uuid    uuid default null,
  p_customer_id    uuid default null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id    uuid;
  v_total      numeric(12,2) := 0;
  v_item       jsonb;
  v_product    record;
  v_qty        integer;
  v_unit_price numeric(12,2);
  v_subtotal   numeric(12,2);
  v_item_desc  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;

  IF p_payment_method = 'fiado' AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_required';
  END IF;

  -- Idempotência: se o client_uuid já existe, devolve o id existente
  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_sale_id
      FROM public.sales
     WHERE client_uuid = p_client_uuid;
    IF FOUND THEN
      RETURN v_sale_id;
    END IF;
  END IF;

  INSERT INTO public.sales (total_amount, payment_method, notes, seller_id, client_uuid, customer_id)
  VALUES (0, p_payment_method, p_notes, auth.uid(), p_client_uuid, p_customer_id)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty       := (v_item->>'quantity')::integer;
    v_item_desc := v_item->>'item_description';

    SELECT id, sale_price, stock_quantity, name, track_stock
      INTO v_product
      FROM public.products
     WHERE id = (v_item->>'product_id')::uuid
       AND is_active = true
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_found:%', (v_item->>'product_id');
    END IF;

    -- Only enforce stock limits for tracked products
    IF v_product.track_stock AND v_product.stock_quantity < v_qty THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_product.name;
    END IF;

    -- Use the override price when provided, otherwise fall back to catalogue price
    v_unit_price := COALESCE(
      NULLIF((v_item->>'unit_price')::numeric, 0),
      v_product.sale_price
    );
    v_subtotal := v_unit_price * v_qty;
    v_total    := v_total + v_subtotal;

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, subtotal, item_description)
    VALUES (v_sale_id, v_product.id, v_qty, v_unit_price, v_subtotal, v_item_desc);

    -- Only deduct stock for tracked products
    IF v_product.track_stock THEN
      UPDATE public.products
         SET stock_quantity = stock_quantity - v_qty
       WHERE id = v_product.id;
    END IF;
  END LOOP;

  UPDATE public.sales SET total_amount = v_total WHERE id = v_sale_id;

  RETURN v_sale_id;
END;
$$;

;
