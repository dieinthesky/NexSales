-- ============================================================
-- Passo 1/2: adiciona o valor 'mixed' no enum payment_method
-- Tem que rodar SOZINHO e COMMITAR antes do resto (limitação do Postgres).
-- ============================================================

DO $$
BEGIN
  ALTER TYPE public.payment_method ADD VALUE 'mixed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
