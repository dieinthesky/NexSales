-- PIX da loja: chave para QR/copia-e-cola no PDV
-- Rode no SQL Editor do Supabase (ou via migrate).

alter table public.stores
  add column if not exists pix_key text,
  add column if not exists pix_merchant_name text,
  add column if not exists pix_merchant_city text;

comment on column public.stores.pix_key is 'Chave PIX (e-mail, telefone, CPF/CNPJ ou aleatória)';
comment on column public.stores.pix_merchant_name is 'Nome no payload EMV (máx. ~25 chars sem acento)';
comment on column public.stores.pix_merchant_city is 'Cidade no payload EMV';

-- Admin da loja (e master) pode atualizar dados da própria loja (PIX etc.)
drop policy if exists "stores_admin_update" on public.stores;
create policy "stores_admin_update" on public.stores
  for update to authenticated
  using (public.is_store_admin(id) or public.is_master())
  with check (public.is_store_admin(id) or public.is_master());
