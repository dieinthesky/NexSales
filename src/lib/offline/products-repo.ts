/**
 * Offline-first product reads for the PDV.
 *
 * REGRA DE OURO:
 *  - Sem internet → só IndexedDB. Zero fetch / zero Supabase.
 *  - Com internet → local primeiro; se vazio, sync e opcionalmente API.
 */

import 'client-only'
import { getDB } from './db'
import { syncProducts } from './sync'
import { createClient } from '@/lib/supabase/client'
import { mayUseNetwork } from './network'
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

async function findLocalMatches(q: string, limit: number): Promise<Product[]> {
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
  return sortMatches(local).slice(0, limit)
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

  const local = await findLocalMatches(q, limit)
  if (local.length > 0) return local

  // Sem inventário local: só tenta rede se online
  if (!mayUseNetwork()) return []

  try {
    await syncProducts()
    const after = await findLocalMatches(q, limit)
    if (after.length > 0) return after

    const remote = await searchProductsRemote(q, limit)
    if (remote.length > 0) {
      try {
        await getDB().products.bulkPut(remote)
      } catch {
        // ignore
      }
      return remote
    }

    const res = await fetch(`/api/products/lookup?q=${encodeURIComponent(q)}`, {
      credentials: 'same-origin',
    })
    if (res.ok) {
      const body = (await res.json()) as { products?: Product[] }
      const apiRows = sortMatches(
        (body.products ?? []).filter((p) => p.code && !isReservedCode(p.code)),
      ).slice(0, limit)
      if (apiRows.length > 0) {
        try {
          await getDB().products.bulkPut(apiRows)
        } catch {
          // ignore
        }
        return apiRows
      }
    }
  } catch {
    // offline mid-request
  }

  return []
}

async function searchProductsRemote(q: string, limit: number): Promise<Product[]> {
  if (!mayUseNetwork()) return []
  const supabase = createClient()
  const safe = q.replace(/[%_\\]/g, '\\$&')
  const pattern = `%${safe}%`
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .or(`name.ilike."${pattern}",code.ilike."${pattern}"`)
    .limit(limit * 2)

  if (error || !data) {
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
  if (!mayUseNetwork()) return null
  const supabase = createClient()
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

async function findLocalByCode(trimmed: string): Promise<Product | null> {
  const db = getDB()
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

/** Exact barcode/SKU lookup. Offline = local only. */
export async function getByCode(code: string): Promise<Product | null> {
  const trimmed = code.trim()
  if (!trimmed || isReservedCode(trimmed)) return null

  const product = await findLocalByCode(trimmed)
  if (product) return product

  if (!mayUseNetwork()) return null

  try {
    await syncProducts()
    const again = await findLocalByCode(trimmed)
    if (again) return again

    const remote = await getByCodeRemote(trimmed)
    if (remote) {
      try {
        await getDB().products.put(remote)
      } catch {
        // ignore
      }
      return remote
    }

    const viaApi = await lookupViaApi(trimmed)
    if (viaApi) {
      try {
        await getDB().products.put(viaApi)
      } catch {
        // ignore
      }
      return viaApi
    }
  } catch {
    // offline mid-flight
  }

  return null
}

async function lookupViaApi(q: string): Promise<Product | null> {
  if (!mayUseNetwork()) return null
  try {
    const res = await fetch(`/api/products/lookup?q=${encodeURIComponent(q)}`, {
      credentials: 'same-origin',
    })
    if (!res.ok) return null
    const body = (await res.json()) as { products?: Product[] }
    const rows = (body.products ?? []).filter((p) => p.code && !isReservedCode(p.code))
    if (rows.length === 0) return null
    const exactCode = rows.find(
      (p) => p.code.trim().toLowerCase() === q.toLowerCase(),
    )
    if (exactCode) return exactCode
    const exactName = rows.find(
      (p) => p.name.trim().toLowerCase() === q.toLowerCase(),
    )
    if (exactName) return exactName
    if (rows.length === 1) return rows[0]
    if (rows.length > 0 && /^\d+$/.test(q)) return rows[0]
    return null
  } catch {
    return null
  }
}

export async function patchLocalProductImage(
  productId: string,
  imageUrl: string,
): Promise<void> {
  try {
    await getDB().products.update(productId, { image_url: imageUrl })
  } catch {
    // best-effort
  }
}

/**
 * Sync no PDV quando online. Offline: nunca tenta rede.
 */
export async function ensureProductsCached(force = false): Promise<void> {
  if (!mayUseNetwork()) return
  try {
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
