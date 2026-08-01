-- Allow Open Products Facts / Open Beauty Facts as barcode_cache sources.
-- Also clear stale "not_found" rows so codes can be re-checked against the new APIs.

alter table public.barcode_cache
  drop constraint if exists barcode_cache_source_check;

alter table public.barcode_cache
  add constraint barcode_cache_source_check
  check (
    source in (
      'cosmos',
      'openfoodfacts',
      'openproductsfacts',
      'openbeautyfacts',
      'upcitemdb',
      'not_found'
    )
  );

delete from public.barcode_cache
where source = 'not_found';
