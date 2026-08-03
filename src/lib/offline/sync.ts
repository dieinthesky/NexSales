/**
 * Sync layer: pulls the canonical Supabase tables into the local IndexedDB
 * cache so the app can read them offline.
 *
 * Strategy (Phase 2):
 *   - Full refresh per entity. We clear the local table and bulk-insert the
 *     latest rows from Supabase. Cheap for the small catalogs this PDV
 *     handles (hundreds of products, not millions).
 *   - Each successful sync stamps the `syncMeta` row with the timestamp
 *     and row count, so the UI can render "last synced X minutes ago".
 *
 * Phase 3 will add incremental sync (filter by `updated_at > lastSyncAt`)
 * and conflict handling for offline mutations.
 */

import 'client-only'
import { createClient } from '@/lib/supabase/client'
import { getDB, type CachedCategory, type CachedCustomer, type CachedProduct, type SyncMeta } from './db'

export interface SyncResult {
  /** How many rows were written to the local cache. */
  synced: number
  /** ISO timestamp of when the sync started — also stored in syncMeta. */
  at: string
}

/**
 * Full refresh of `products`. Active products only — inactive ones aren't
 * useful in the PDV and would bloat the local cache for no reason.
 */
async function activeStoreId(
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('user_store_id')
  if (!error && data) return data as string

  // Fallback se a RPC falhar (JWT fraco)
  try {
    const { data: userData } = await supabase.auth.getUser()
    const uid = userData.user?.id
    if (!uid) return null
    const { data: membership } = await supabase
      .from('store_members')
      .select('store_id')
      .eq('user_id', uid)
      .maybeSingle()
    return membership?.store_id ?? null
  } catch {
    return null
  }
}

export async function syncProducts(): Promise<SyncResult> {
  const supabase = createClient()
  const storeId = await activeStoreId(supabase)
  const at = new Date().toISOString()
  const db = getDB()

  // NUNCA zerar o catálogo se não souber a loja — só mantém o que já tem
  if (!storeId) {
    const count = await db.products.count()
    return { synced: count, at }
  }

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .eq('store_id', storeId)

  if (error) throw error
  const rows = ((data ?? []) as CachedProduct[]).filter(
    (p) => p.code && !String(p.code).startsWith('__'),
  )

  await db.transaction('rw', db.products, db.syncMeta, async () => {
    await db.products.clear()
    if (rows.length > 0) await db.products.bulkAdd(rows)
    await db.syncMeta.put({ key: 'products', lastSyncAt: at, count: rows.length })
  })

  return { synced: rows.length, at }
}

/** Full refresh of `categories`. Small table, always replaced wholesale. */
export async function syncCategories(): Promise<SyncResult> {
  const supabase = createClient()
  const storeId = await activeStoreId(supabase)
  const at = new Date().toISOString()
  const db = getDB()

  // NUNCA zerar categorias se não souber a loja
  if (!storeId) {
    const count = await db.categories.count()
    return { synced: count, at }
  }

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('store_id', storeId)

  if (error) throw error
  const rows = (data ?? []) as CachedCategory[]

  await db.transaction('rw', db.categories, db.syncMeta, async () => {
    await db.categories.clear()
    if (rows.length > 0) await db.categories.bulkAdd(rows)
    await db.syncMeta.put({ key: 'categories', lastSyncAt: at, count: rows.length })
  })

  return { synced: rows.length, at }
}

/** Full refresh of `customer_balances`. Syncs all customers for offline fiado search. */
export async function syncCustomers(): Promise<SyncResult> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('customer_balances')
    .select('*')
    .order('full_name')

  if (error) throw error
  const rows = (data ?? []) as CachedCustomer[]
  const at = new Date().toISOString()

  const db = getDB()
  await db.transaction('rw', db.customers, db.syncMeta, async () => {
    await db.customers.clear()
    if (rows.length > 0) await db.customers.bulkAdd(rows)
    await db.syncMeta.put({ key: 'customers', lastSyncAt: at, count: rows.length })
  })

  return { synced: rows.length, at }
}

/**
 * Run all syncs in parallel. Failures are caught per-entity so a transient
 * outage in one table doesn't poison the others.
 */
export async function syncAll(): Promise<{
  products: SyncResult | { error: string }
  categories: SyncResult | { error: string }
  customers: SyncResult | { error: string }
}> {
  const [products, categories, customers] = await Promise.all([
    syncProducts().catch((err: unknown) => ({
      error: err instanceof Error ? err.message : 'Erro ao sincronizar produtos',
    })),
    syncCategories().catch((err: unknown) => ({
      error: err instanceof Error ? err.message : 'Erro ao sincronizar categorias',
    })),
    syncCustomers().catch((err: unknown) => ({
      error: err instanceof Error ? err.message : 'Erro ao sincronizar clientes',
    })),
  ])
  return { products, categories, customers }
}

/** Read a sync timestamp from the local cache. Returns null if never synced. */
export async function getLastSync(
  key: SyncMeta['key'],
): Promise<SyncMeta | undefined> {
  return getDB().syncMeta.get(key)
}
