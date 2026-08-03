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

const DEFAULT_LIMIT = 20

function isReservedCode(code: string | null | undefined): boolean {
  return Boolean(code && code.startsWith('__'))
}

/**
 * Substring search by name OR code, case-insensitive.
 * Produtos sem estoque também aparecem (aviso no PDV).
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
        !isReservedCode(p.code) &&
        (p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)),
    )
    .limit(limit * 3)
    .toArray()

  return matches
    .sort((a, b) => {
      const aStock = !a.track_stock || a.stock_quantity > 0 ? 0 : 1
      const bStock = !b.track_stock || b.stock_quantity > 0 ? 0 : 1
      if (aStock !== bStock) return aStock - bStock
      return a.name.localeCompare(b.name, 'pt-BR')
    })
    .slice(0, limit)
}

/** Exact barcode/SKU lookup. Returns null when there's no active match. */
export async function getByCode(code: string): Promise<Product | null> {
  const trimmed = code.trim()
  if (!trimmed || isReservedCode(trimmed)) return null

  const db = getDB()

  async function findLocal(): Promise<Product | null> {
    let product = await db.products.where('code').equals(trimmed).first()
    if (product?.is_active && !isReservedCode(product.code)) return product

    const all = await db.products
      .filter(
        (p) =>
          p.is_active &&
          !isReservedCode(p.code) &&
          p.code.trim().toLowerCase() === trimmed.toLowerCase(),
      )
      .first()
    return all ?? null
  }

  let product = await findLocal()
  if (product) return product

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      await syncProducts()
      product = await findLocal()
      if (product) return product
    } catch {
      // offline
    }
  }

  return null
}

/** Atualiza a foto no cache local (PDV) sem esperar o sync. */
export async function patchLocalProductImage(
  productId: string,
  imageUrl: string,
): Promise<void> {
  try {
    const db = getDB()
    await db.products.update(productId, { image_url: imageUrl })
  } catch {
    // best-effort
  }
}

/**
 * Sync no PDV: ao abrir Nova Venda, baixa o catálogo de novo (rede ok).
 */
export async function ensureProductsCached(force = false): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const db = getDB()
    const count = await db.products.count()
    if (force || count === 0) {
      await syncProducts()
      return
    }
    const meta = await db.syncMeta.get('products')
    if (!meta || Date.now() - new Date(meta.lastSyncAt).getTime() > 45_000) {
      await syncProducts()
    }
  } catch {
    // Best-effort
  }
}
