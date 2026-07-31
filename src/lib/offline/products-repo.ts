/**
 * Offline-first product reads for the PDV.
 *
 * The point of sale must work with no network, so it reads exclusively from
 * the local IndexedDB cache (kept fresh by `SyncProvider` → `sync.ts`).
 * Catalogs here are small (hundreds of rows), so a full `.filter()` scan for
 * substring matches is cheap and mirrors the previous Supabase `ilike %q%`
 * semantics exactly — no need for prefix-only Dexie index queries.
 *
 * Browser-only: `getDB()` throws on the server, so only import from client
 * components.
 */

import 'client-only'
import { getDB } from './db'
import { syncProducts } from './sync'
import type { Product } from '@/types/database'

const DEFAULT_LIMIT = 10

/**
 * Substring search by name OR code, case-insensitive. Only active products
 * with stock are returned — same filter the PDV always applied.
 */
export async function searchProducts(
  query: string,
  limit = DEFAULT_LIMIT,
): Promise<Product[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const db = getDB()
  const matches = await db.products
    .filter(
      (p) =>
        p.is_active &&
        (!p.track_stock || p.stock_quantity > 0) &&
        (p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)),
    )
    .limit(limit)
    .toArray()

  // Stable, predictable ordering for the dropdown.
  return matches.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/** Exact barcode/SKU lookup. Returns null when there's no active match. */
export async function getByCode(code: string): Promise<Product | null> {
  const trimmed = code.trim()
  if (!trimmed) return null

  const db = getDB()
  const product = await db.products.where('code').equals(trimmed).first()
  if (!product || !product.is_active) return null
  return product
}

const STALE_MS = 5 * 60_000 // re-sync if cache is older than 5 minutes

/**
 * First-load safety net: syncs products if the local cache is empty OR if the
 * last sync is older than STALE_MS (5 min). This ensures a newly created or
 * edited product shows up in the PDV without waiting for the 60-second periodic
 * sync. Best-effort — swallows errors since the PDV must keep working regardless.
 */
export async function ensureProductsCached(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const db = getDB()
    const count = await db.products.count()
    if (count === 0) {
      await syncProducts()
      return
    }
    const meta = await db.syncMeta.get('products')
    if (!meta || Date.now() - new Date(meta.lastSyncAt).getTime() > STALE_MS) {
      await syncProducts()
    }
  } catch {
    // Best-effort; the empty-state UI handles a still-empty cache.
  }
}
