-- ============================================================
-- cancel_sale: só devolve estoque quando track_stock = true
-- (espelha create_sale_with_items — AVULSO/serviços não alteram estoque)
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
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select exists(select 1 from public.sales where id = p_sale_id) into v_exists;
  if not v_exists then
    raise exception 'sale_not_found' using errcode = 'P0001';
  end if;

  for v_item in
    select si.product_id, si.quantity, p.track_stock
      from public.sale_items si
      join public.products p on p.id = si.product_id
     where si.sale_id = p_sale_id
       for update of p
  loop
    if coalesce(v_item.track_stock, true) then
      update public.products
         set stock_quantity = stock_quantity + v_item.quantity
       where id = v_item.product_id;
    end if;
  end loop;

  delete from public.sales where id = p_sale_id;
end;
$$;

grant execute on function public.cancel_sale(uuid) to authenticated;
