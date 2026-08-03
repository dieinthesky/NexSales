-- ============================================================
-- PIX da loja — já está DENTRO de RODAR-MASTER-LOJAS-TUDO.sql
--
-- Preferência: rode só o RODAR-MASTER-LOJAS-TUDO.sql (tudo de uma vez).
-- Use este arquivo se o banco já tem master/lojas e falta só o PIX.
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
