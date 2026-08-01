-- ============================================================
-- Fotos de produto: coluna image_url + bucket no Storage
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url text;

-- Bucket público (PDV e offline precisam ler a URL sem auth especial)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-photos',
  'product-photos',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "product_photos_public_read" ON storage.objects;
CREATE POLICY "product_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-photos');

DROP POLICY IF EXISTS "product_photos_authenticated_insert" ON storage.objects;
CREATE POLICY "product_photos_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-photos');

DROP POLICY IF EXISTS "product_photos_authenticated_update" ON storage.objects;
CREATE POLICY "product_photos_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-photos');

DROP POLICY IF EXISTS "product_photos_authenticated_delete" ON storage.objects;
CREATE POLICY "product_photos_authenticated_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-photos');
