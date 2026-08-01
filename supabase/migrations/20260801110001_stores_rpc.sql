-- RPCs cientes de loja + provisionamento Master.

create or replace function public.create_sale_with_items(
  p_payment_method public.payment_method,
  p_notes          text,
  p_items          jsonb,
  p_client_uuid    uuid DEFAULT NULL,
  p_customer_id    uuid DEFAULT NULL,
  p_payments       jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_store_id IS NULL AND NOT public.is_master() THEN
    RAISE EXCEPTION 'store_required';
  END IF;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'store_required';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;

  IF p_payment_method = 'fiado' AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_required';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = p_customer_id AND c.store_id = v_store_id
    ) THEN
      RAISE EXCEPTION 'customer_wrong_store';
    END IF;
  END IF;

  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_sale_id
      FROM public.sales
     WHERE client_uuid = p_client_uuid;
    IF FOUND THEN
      RETURN v_sale_id;
    END IF;
  END IF;

  v_header_method := p_payment_method;

  INSERT INTO public.sales (total_amount, payment_method, notes, seller_id, client_uuid, customer_id, store_id)
  VALUES (0, v_header_method, p_notes, auth.uid(), p_client_uuid, p_customer_id, v_store_id)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty       := (v_item->>'quantity')::integer;
    v_item_desc := v_item->>'item_description';

    SELECT id, sale_price, stock_quantity, name, track_stock, store_id
      INTO v_product
      FROM public.products
     WHERE id = (v_item->>'product_id')::uuid
       AND is_active = true
       AND store_id = v_store_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_found:%', (v_item->>'product_id');
    END IF;

    IF v_product.track_stock AND v_product.stock_quantity < v_qty THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_product.name;
    END IF;

    v_unit_price := COALESCE(
      NULLIF((v_item->>'unit_price')::numeric, 0),
      v_product.sale_price
    );
    v_subtotal := v_unit_price * v_qty;
    v_total    := v_total + v_subtotal;

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, subtotal, item_description)
    VALUES (v_sale_id, v_product.id, v_qty, v_unit_price, v_subtotal, v_item_desc);

    IF v_product.track_stock THEN
      UPDATE public.products
         SET stock_quantity = stock_quantity - v_qty
       WHERE id = v_product.id;
    END IF;
  END LOOP;

  IF p_payments IS NOT NULL AND jsonb_typeof(p_payments) = 'array' AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
      v_pay_method := (v_pay->>'method')::public.payment_method;
      v_pay_amount := (v_pay->>'amount')::numeric;

      IF v_pay_method::text = 'mixed' THEN
        RAISE EXCEPTION 'invalid_payment';
      END IF;
      IF v_pay_amount IS NULL OR v_pay_amount <= 0 THEN
        RAISE EXCEPTION 'invalid_payment';
      END IF;
      IF v_pay_method = 'fiado' AND p_customer_id IS NULL THEN
        RAISE EXCEPTION 'customer_required';
      END IF;

      INSERT INTO public.sale_payments (sale_id, payment_method, amount)
      VALUES (v_sale_id, v_pay_method, v_pay_amount);

      v_pay_sum := v_pay_sum + v_pay_amount;
      v_pay_count := v_pay_count + 1;
    END LOOP;

    IF abs(v_pay_sum - v_total) > 0.009 THEN
      RAISE EXCEPTION 'payment_mismatch';
    END IF;

    IF v_pay_count > 1 THEN
      v_header_method := 'mixed';
    ELSE
      SELECT payment_method INTO v_header_method
        FROM public.sale_payments
       WHERE sale_id = v_sale_id
       LIMIT 1;
    END IF;
  ELSE
    INSERT INTO public.sale_payments (sale_id, payment_method, amount)
    VALUES (v_sale_id, p_payment_method, v_total);
    v_header_method := p_payment_method;
  END IF;

  UPDATE public.sales
     SET total_amount = v_total,
         payment_method = v_header_method
   WHERE id = v_sale_id;

  RETURN v_sale_id;
END;
$$;

-- Master: cria loja + admin dono + opcionalmente copia catálogo modelo
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

-- Master: zera vendas/fiado da loja (mantém catálogo)
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
  -- sale_items / sale_payments caem em cascade
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

notify pgrst, 'reload schema';
