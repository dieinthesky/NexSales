/**
 * Offline-first product reads for the PDV.
 *
 * Local IndexedDB first; when online and local miss, sync and query Supabase.
 */

import 'client-only'
import { getDB } from './db'
import { syncProducts } from './sync'
import { createClient } from '@/lib/supabase/client'
import type { Product } from '@/types/database'

const DEFAULT_LIMIT = 20

function isReservedCode(code: string | null | undefined): boolean {
  return Boolean(code && code.startsWith('__'))
}

function sortMatches(matches: Product[]): Product[] {
  return matches.sort((a, b) => {
    const aStock = !a.track_stock || a.stock_quantity > 0 ? 0 : 1
    const bStock = !b.track_stock || b.stock_quantity > 0 ? 0 : 1
    if (aStock !== bStock) return aStock - bStock
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}

/**
 * Substring search by name OR code, case-insensitive.
 */
export async function searchProducts(
  query: string,
  limit = DEFAULT_LIMIT,
): Promise<Product[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const db = getDB()
  const local = await db.products
    .filter(
      (p) =>
        p.is_active &&
        !isReservedCode(p.code) &&
        (p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)),
    )
    .limit(limit * 3)
    .toArray()

  if (local.length > 0) {
    return sortMatches(local).slice(0, limit)
  }

  // Catalog vazio ou desatualizado: tenta rede
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      await syncProducts()
      const after = await db.products
        .filter(
          (p) =>
            p.is_active &&
            !isReservedCode(p.code) &&
            (p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)),
        )
        .limit(limit * 3)
        .toArray()
      if (after.length > 0) return sortMatches(after).slice(0, limit)

      const remote = await searchProductsRemote(q, limit)
      if (remote.length > 0) {
        // injeta no cache local
        try {
          await db.products.bulkPut(remote)
        } catch {
          // ignore
        }
        return remote
      }
    } catch {
      // offline / falha
    }
  }

  return []
}

async function searchProductsRemote(q: string, limit: number): Promise<Product[]> {
  const supabase = createClient()
  // Escapa % e _ para não virar curinga do ilike
  const safe = q.replace(/[%_\\]/g, '\\$&')
  const pattern = `%${safe}%`
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .or(`name.ilike."${pattern}",code.ilike."${pattern}"`)
    .limit(limit * 2)

  if (error || !data) {
    // Fallback sem aspas se o filtro quebrado
    const again = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .ilike('name', pattern)
      .limit(limit)
    if (!again.data) return []
    return sortMatches(
      (again.data as Product[]).filter((p) => p.code && !isReservedCode(p.code)),
    ).slice(0, limit)
  }

  return sortMatches(
    (data as Product[]).filter((p) => p.code && !isReservedCode(p.code)),
  ).slice(0, limit)
}

async function getByCodeRemote(code: string): Promise<Product | null> {
  const supabase = createClient()
  // exact code primeiro; fallback nome curto
  const { data: byCode } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .ilike('code', code)
    .limit(5)

  const rows = ((byCode ?? []) as Product[]).filter(
    (p) => p.code && !isReservedCode(p.code),
  )
  const exact = rows.find((p) => p.code.trim().toLowerCase() === code.toLowerCase())
  if (exact) return exact

  if (code.length >= 2) {
    const { data: byName } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .ilike('name', `%${code}%`)
      .limit(5)
    const nameRows = ((byName ?? []) as Product[]).filter(
      (p) => !isReservedCode(p.code),
    )
    if (nameRows.length === 1) return nameRows[0]
    const exactName = nameRows.find(
      (p) => p.name.trim().toLowerCase() === code.toLowerCase(),
    )
    if (exactName) return exactName
  }

  return rows[0] ?? null
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
    if (all) return all

    // Nome exato no cache
    return (
      (await db.products
        .filter(
          (p) =>
            p.is_active &&
            !isReservedCode(p.code) &&
            p.name.trim().toLowerCase() === trimmed.toLowerCase(),
        )
        .first()) ?? null
    )
  }

  let product = await findLocal()
  if (product) return product

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      await syncProducts()
      product = await findLocal()
      if (product) return product

      const remote = await getByCodeRemote(trimmed)
      if (remote) {
        try {
          await db.products.put(remote)
        } catch {
          // ignore
        }
        return remote
      }
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
