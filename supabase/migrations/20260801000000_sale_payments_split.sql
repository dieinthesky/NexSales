-- ============================================================
-- Pagamento misto: várias formas por venda (ex. PIX + dinheiro)
-- ============================================================

DO $$
BEGIN
  ALTER TYPE public.payment_method ADD VALUE 'mixed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  payment_method public.payment_method NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_payments_method_not_mixed CHECK (payment_method <> 'mixed')
);

CREATE INDEX IF NOT EXISTS sale_payments_sale_id_idx
  ON public.sale_payments (sale_id);

ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sale_payments_select_authenticated" ON public.sale_payments;
CREATE POLICY "sale_payments_select_authenticated"
  ON public.sale_payments FOR SELECT TO authenticated
  USING (true);

-- RPC: aceita p_payments opcional
-- [{"method":"pix","amount":10},{"method":"cash","amount":10}]
DROP FUNCTION IF EXISTS public.create_sale_with_items(public.payment_method, text, jsonb, uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_sale_with_items(
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

  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_sale_id
      FROM public.sales
     WHERE client_uuid = p_client_uuid;
    IF FOUND THEN
      RETURN v_sale_id;
    END IF;
  END IF;

  -- Header method: mixed when several payments; else the single method.
  v_header_method := p_payment_method;

  INSERT INTO public.sales (total_amount, payment_method, notes, seller_id, client_uuid, customer_id)
  VALUES (0, v_header_method, p_notes, auth.uid(), p_client_uuid, p_customer_id)
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

      IF v_pay_method = 'mixed' THEN
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

GRANT EXECUTE ON FUNCTION public.create_sale_with_items(
  public.payment_method, text, jsonb, uuid, uuid, jsonb
) TO authenticated;
