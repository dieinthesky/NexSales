import 'server-only'
import { createSyncClient } from '@/lib/supabase/server'
import { getDb, type NxDB } from './client'
import type { Category, Product, Customer, Sale, SaleItem, DebtPayment } from '@/types/database'

export interface SyncResult {
  pulled: boolean
  pushed: number
  error?: string
  lastSyncedAt?: string
}

export async function runSync(): Promise<SyncResult> {
  try {
    const supabase = await createSyncClient()

    // Quick connectivity check — if Supabase is unreachable this will throw/return error.
    const { error: pingError } = await supabase.from('categories').select('id').limit(1)
    if (pingError) throw new Error(`Supabase unreachable: ${pingError.message}`)

    await pullFromSupabase()
    const pushed = await pushPendingQueue()

    const lastSyncedAt = new Date().toISOString()
    getDb()
      .prepare(`INSERT OR REPLACE INTO sync_meta (table_name, last_synced_at) VALUES (?, ?)`)
      .run('all', lastSyncedAt)

    return { pulled: true, pushed, lastSyncedAt }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { pulled: false, pushed: 0, error }
  }
}

async function pullFromSupabase(): Promise<void> {
  const supabase = await createSyncClient()
  const db: NxDB = getDb()

  // Fetch reference data + recent records in parallel
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const [catRes, prodRes, custRes, salesRes, paymentsRes] = await Promise.all([
    supabase.from('categories').select('*'),
    supabase.from('products').select('*'),
    supabase.from('customers').select('*'),
    supabase.from('sales').select('*').gte('created_at', since),
    supabase.from('debt_payments').select('*').gte('created_at', since),
  ])

  const remoteSales = (salesRes.data ?? []) as Sale[]
  const saleIds = remoteSales.map((s) => s.id)
  let saleItems: SaleItem[] = []
  // Chunk .in() — PostgREST/URL limits; avoid huge single requests
  const CHUNK = 200
  for (let i = 0; i < saleIds.length; i += CHUNK) {
    const chunk = saleIds.slice(i, i + CHUNK)
    const { data } = await supabase.from('sale_items').select('*').in('sale_id', chunk)
    if (data?.length) saleItems = saleItems.concat(data as SaleItem[])
  }

  const remoteSaleIdSet = new Set(saleIds)

  const upsertAll = db.transaction(() => {
    _upsertCategories(catRes.data as Category[] ?? [])
    _upsertProducts(prodRes.data as Product[] ?? [])
    _upsertCustomers(custRes.data as Customer[] ?? [])
    _upsertSales(remoteSales)
    _upsertSaleItems(saleItems)
    _upsertDebtPayments(paymentsRes.data as DebtPayment[] ?? [])

    // Remove local sales in the sync window that no longer exist remotely (cancelled)
    const localRecent = db
      .prepare(`SELECT id FROM sales WHERE created_at >= ?`)
      .all(since) as { id: string }[]
    for (const row of localRecent) {
      if (!remoteSaleIdSet.has(row.id)) {
        db.prepare(`DELETE FROM sale_items WHERE sale_id = ?`).run(row.id)
        db.prepare(`DELETE FROM sales WHERE id = ?`).run(row.id)
      }
    }
  })

  upsertAll()
}

function _upsertCategories(rows: Category[]): void {
  const db: NxDB = getDb()
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO categories (id, name, created_at) VALUES (?, ?, ?)`,
  )
  for (const r of rows) stmt.run(r.id, r.name, r.created_at)
}

function _upsertProducts(rows: Product[]): void {
  const db: NxDB = getDb()
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO products
     (id, code, name, description, sale_price, cost_price, stock_quantity, min_stock,
      category_id, is_active, track_stock, image_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const r of rows) {
    stmt.run(
      r.id, r.code, r.name, r.description ?? null,
      r.sale_price, r.cost_price ?? null,
      r.stock_quantity, r.min_stock,
      r.category_id ?? null, r.is_active ? 1 : 0,
      r.track_stock === false ? 0 : 1,
      r.image_url ?? null,
      r.created_at, r.updated_at,
    )
  }
}

function _upsertCustomers(rows: Customer[]): void {
  const db: NxDB = getDb()
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO customers (id, full_name, phone, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  for (const r of rows) stmt.run(r.id, r.full_name, r.phone ?? null, r.notes ?? null, r.created_at, r.updated_at)
}

function _upsertSales(rows: Sale[]): void {
  const db: NxDB = getDb()
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO sales
     (id, total_amount, payment_method, notes, seller_id, created_at, client_uuid, customer_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const r of rows) {
    stmt.run(
      r.id, r.total_amount, r.payment_method, r.notes ?? null,
      r.seller_id, r.created_at, r.client_uuid ?? null, r.customer_id ?? null,
    )
  }
}

function _upsertSaleItems(rows: SaleItem[]): void {
  const db: NxDB = getDb()
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO sale_items
     (id, sale_id, product_id, quantity, unit_price, subtotal, item_description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const r of rows) {
    stmt.run(
      r.id, r.sale_id, r.product_id, r.quantity, r.unit_price, r.subtotal,
      r.item_description ?? null,
    )
  }
}

function _upsertDebtPayments(rows: DebtPayment[]): void {
  const db: NxDB = getDb()
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO debt_payments (id, customer_id, amount, notes, recorded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  for (const r of rows) stmt.run(r.id, r.customer_id, r.amount, r.notes ?? null, r.recorded_by, r.created_at)
}

/**
 * After a successful createSale() RPC, pulls just that sale + its items +
 * the affected products (to reflect the decremented stock) into SQLite so
 * pages that read from SQLite (Histórico, Dashboard) show the sale immediately
 * instead of waiting for the next periodic sync cycle.
 *
 * Called from the createSale server action when isElectron() is true.
 * Failures are swallowed — the periodic sync will pick up the data within 60s.
 */
export async function pullSingleSale(saleId: string): Promise<void> {
  const supabase = await createSyncClient()
  const db = getDb()

  const [saleRes, itemsRes] = await Promise.all([
    supabase.from('sales').select('*').eq('id', saleId).single(),
    supabase.from('sale_items').select('*').eq('sale_id', saleId),
  ])

  if (!saleRes.data) return

  const sale = saleRes.data as Sale
  const items = (itemsRes.data ?? []) as SaleItem[]

  const productIds = items.map((i) => i.product_id)
  let products: Product[] = []
  if (productIds.length > 0) {
    const { data } = await supabase.from('products').select('*').in('id', productIds)
    products = (data ?? []) as Product[]
  }

  db.transaction(() => {
    _upsertSales([sale])
    _upsertSaleItems(items)
    if (products.length > 0) _upsertProducts(products)
  })()
}

/**
 * When a sale is cancelled (admin action), removes it from SQLite and restores
 * the product stock by re-fetching the affected products from Supabase.
 * Called from the cancelSale server action when isElectron() is true.
 */
export async function deleteLocalSale(saleId: string): Promise<void> {
  const db = getDb()

  // Read affected product IDs before deleting so we can refresh their stock.
  const affectedProductIds = (
    db
      .prepare(`SELECT product_id FROM sale_items WHERE sale_id = ?`)
      .all(saleId) as { product_id: string }[]
  ).map((r) => r.product_id)

  db.transaction(() => {
    db.prepare(`DELETE FROM sale_items WHERE sale_id = ?`).run(saleId)
    db.prepare(`DELETE FROM sales WHERE id = ?`).run(saleId)
  })()

  // Refresh product stock from Supabase so the PDV shows correct availability.
  if (affectedProductIds.length > 0) {
    try {
      const supabase = await createSyncClient()
      const { data } = await supabase.from('products').select('*').in('id', affectedProductIds)
      if (data && data.length > 0) _upsertProducts(data as Product[])
    } catch {
      // Best-effort — periodic sync will pick up stock updates within 60s.
    }
  }
}

// Processes pending sync_queue entries and applies them to Supabase.
// Returns the number of events successfully pushed.
async function pushPendingQueue(): Promise<number> {
  const db = getDb()
  const supabase = await createSyncClient()

  interface QueueRow {
    id: number
    event_type: string
    entity_type: string
    entity_id: string
    payload: string
    attempts: number
  }

  const pending = db
    .prepare(
      `SELECT id, event_type, entity_type, entity_id, payload, attempts
       FROM sync_queue WHERE status = 'pending' ORDER BY created_at LIMIT 50`,
    )
    .all() as QueueRow[]

  let pushed = 0
  for (const item of pending) {
    try {
      const payload = JSON.parse(item.payload)

      if (item.event_type === 'CREATE_SALE') {
        const { error } = await supabase.rpc('create_sale_with_items', {
          p_payment_method: payload.payment_method,
          p_notes: payload.notes ?? null,
          p_items: payload.items,
          p_client_uuid: payload.client_uuid ?? null,
          p_customer_id: payload.customer_id ?? null,
        })
        if (error) throw new Error(error.message)
      } else if (item.event_type === 'RECORD_DEBT_PAYMENT') {
        const { error } = await supabase.rpc('record_debt_payment', {
          p_customer_id: payload.customer_id,
          p_amount: payload.amount,
          p_notes: payload.notes ?? null,
        })
        if (error) throw new Error(error.message)
      }
      // Additional event types will be handled here as offline writes are added.

      db.prepare(
        `UPDATE sync_queue SET status = 'synced', synced_at = ? WHERE id = ?`,
      ).run(new Date().toISOString(), item.id)
      pushed++
    } catch {
      const nextAttempts = item.attempts + 1
      db.prepare(
        `UPDATE sync_queue SET attempts = ?, status = ? WHERE id = ?`,
      ).run(nextAttempts, nextAttempts >= 3 ? 'error' : 'pending', item.id)
    }
  }

  return pushed
}
