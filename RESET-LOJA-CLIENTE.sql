-- Master: zera operações de uma loja (vendas, fiado, clientes).
-- Mantém produtos/categorias. Pode rodar no SQL Editor se o botão falhar.
-- Troque o slug pela loja desejada.

do $$
declare
  v_store uuid;
  v_slug text := 'mercadinho-walter'; -- mude se necessário
begin
  select id into v_store from public.stores where slug = v_slug;
  if v_store is null then
    raise exception 'Loja não encontrada: %', v_slug;
  end if;

  delete from public.debt_payments where store_id = v_store;
  delete from public.sales where store_id = v_store;
  delete from public.customers where store_id = v_store;
  update public.products
    set stock_quantity = 0, updated_at = now()
    where store_id = v_store;

  raise notice 'Reset OK: %', v_store;
end $$;

-- Opcional: limpar também o histórico do catálogo modelo (slug catalogo-modelo)
-- do $$
-- declare v_store uuid;
-- begin
--   select id into v_store from public.stores where slug = 'catalogo-modelo';
--   if v_store is not null then
--     delete from public.debt_payments where store_id = v_store;
--     delete from public.sales where store_id = v_store;
--     delete from public.customers where store_id = v_store;
--   end if;
-- end $$;
