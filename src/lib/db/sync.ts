import 'server-only'
import { createSyncClient } from '@/lib/supabase/server'
import { getAdminDataClient, resolveAdminContext } from '@/lib/supabase/admin-data'
import { getDb, type NxDB } from './client'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { getCurrentUser } from '@/lib/auth/roles'
import type { Category, Product, Customer, Sale, SaleItem, DebtPayment } from '@/types/database'

export interface SyncResult {
  pulled: boolean
  pushed: number
  error?: string
  lastSyncedAt?: string
  productCount?: number
}

/**
 * Pulls Supabase → SQLite for the Electron app.
 * Usa service role + paginação para bater com o catálogo completo do site
 * (antes a lista travava em ~1000 linhas e muitas vezes em um cache parcial ~67).
 */
export async function runSync(): Promise<SyncResult> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { pulled: false, pushed: 0, error: 'Unauthorized' }
    }

    const ctx = await resolveAdminContext(user)
    const storeId = ctx.storeId
    const client = (await getAdminDataClient()) ?? (await createSyncClient())

    await pullFromSupabase(client, storeId)
    const pushed = await pushPendingQueue()

    const lastSyncedAt = new Date().toISOString()
    const db = getDb()
    db.prepare(
      `INSERT OR REPLACE INTO sync_meta (table_name, last_synced_at) VALUES (?, ?)`,
    ).run('all', lastSyncedAt)

    const productCount = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM products WHERE is_active = 1 AND code NOT LIKE '\\_\\_%' ESCAPE '\\'`,
        )
        .get() as { c: number }
    ).c

    return { pulled: true, pushed, lastSyncedAt, productCount }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { pulled: false, pushed: 0, error }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pullFromSupabase(supabase: any, storeId: string | null): Promise<void> {
  const db: NxDB = getDb()
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const [categories, products, customers, remoteSales, payments] = await Promise.all([
    fetchAllRows<Category>((from, to) => {
      let q = supabase.from('categories').select('*').order('id').range(from, to)
      if (storeId) q = q.eq('store_id', storeId)
      return q
    }),
    fetchAllRows<Product>((from, to) => {
      let q = supabase.from('products').select('*').order('id').range(from, to)
      if (storeId) q = q.eq('store_id', storeId)
      return q
    }),
    fetchAllRows<Customer>((from, to) => {
      let q = supabase.from('customers').select('*').order('id').range(from, to)
      if (storeId) q = q.eq('store_id', storeId)
      return q
    }),
    fetchAllRows<Sale>((from, to) => {
      let q = supabase
        .from('sales')
        .select('*')
        .gte('created_at', since)
        .order('id')
        .range(from, to)
      if (storeId) q = q.eq('store_id', storeId)
      return q
    }),
    fetchAllRows<DebtPayment>((from, to) => {
      return supabase
        .from('debt_payments')
        .select('*')
        .gte('created_at', since)
        .order('id')
        .range(from, to)
    }),
  ])

  // Guardrail: never wipe local catalog if the cloud returned zero products
  // (network/RLS glitch). Keep stale cache so the caixa still works.
  if (products.length === 0) {
    console.warn(
      '[sync] skip product/category rewrite: cloud returned 0 products for store',
      storeId,
    )
  }

  const saleIds = remoteSales.map((s) => s.id)
  let saleItems: SaleItem[] = []
  const CHUNK = 200
  for (let i = 0; i < saleIds.length; i += CHUNK) {
    const chunk = saleIds.slice(i, i + CHUNK)
    const { data } = await supabase.from('sale_items').select('*').in('sale_id', chunk)
    if (data?.length) saleItems = saleItems.concat(data as SaleItem[])
  }

  const remoteSaleIdSet = new Set(saleIds)

  const upsertAll = db.transaction(() => {
    if (products.length > 0) {
      // Remonta o catálogo inteiro da loja (paridade com o site)
      db.prepare(`DELETE FROM products`).run()
      db.prepare(`DELETE FROM categories`).run()
      _upsertCategories(categories)
      _upsertProducts(products)
    } else {
      if (categories.length > 0) _upsertCategories(categories)
    }

    if (customers.length > 0) {
      db.prepare(`DELETE FROM customers`).run()
      _upsertCustomers(customers)
    }

    _upsertSales(remoteSales)
    _upsertSaleItems(saleItems)
    _upsertDebtPayments(payments)

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
  const hasStore = columnExists(db, 'categories', 'store_id')
  const stmt = hasStore
    ? db.prepare(
        `INSERT OR REPLACE INTO categories (id, name, store_id, created_at) VALUES (?, ?, ?, ?)`,
      )
    : db.prepare(`INSERT OR REPLACE INTO categories (id, name, created_at) VALUES (?, ?, ?)`)
  for (const r of rows) {
    if (hasStore) stmt.run(r.id, r.name, r.store_id ?? null, r.created_at)
    else stmt.run(r.id, r.name, r.created_at)
  }
}

function _upsertProducts(rows: Product[]): void {
  const db: NxDB = getDb()
  const hasStore = columnExists(db, 'products', 'store_id')
  const stmt = hasStore
    ? db.prepare(
        `INSERT OR REPLACE INTO products
         (id, code, name, description, sale_price, cost_price, stock_quantity, min_stock,
          category_id, is_active, track_stock, image_url, store_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
    : db.prepare(
        `INSERT OR REPLACE INTO products
         (id, code, name, description, sale_price, cost_price, stock_quantity, min_stock,
          category_id, is_active, track_stock, image_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
  for (const r of rows) {
    if (r.code && String(r.code).startsWith('__')) continue
    if (hasStore) {
      stmt.run(
        r.id,
        r.code,
        r.name,
        r.description ?? null,
        r.sale_price,
        r.cost_price ?? 0,
        r.stock_quantity,
        r.min_stock,
        r.category_id ?? null,
        r.is_active ? 1 : 0,
        r.track_stock === false ? 0 : 1,
        r.image_url ?? null,
        r.store_id ?? null,
        r.created_at,
        r.updated_at,
      )
    } else {
      stmt.run(
        r.id,
        r.code,
        r.name,
        r.description ?? null,
        r.sale_price,
        r.cost_price ?? 0,
        r.stock_quantity,
        r.min_stock,
        r.category_id ?? null,
        r.is_active ? 1 : 0,
        r.track_stock === false ? 0 : 1,
        r.image_url ?? null,
        r.created_at,
        r.updated_at,
      )
    }
  }
}

function _upsertCustomers(rows: Customer[]): void {
  const db: NxDB = getDb()
  const hasStore = columnExists(db, 'customers', 'store_id')
  const stmt = hasStore
    ? db.prepare(
        `INSERT OR REPLACE INTO customers (id, full_name, phone, notes, store_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
    : db.prepare(
        `INSERT OR REPLACE INTO customers (id, full_name, phone, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
  for (const r of rows) {
    const store = (r as Customer & { store_id?: string | null }).store_id ?? null
    if (hasStore) {
      stmt.run(r.id, r.full_name, r.phone ?? null, r.notes ?? null, store, r.created_at, r.updated_at)
    } else {
      stmt.run(r.id, r.full_name, r.phone ?? null, r.notes ?? null, r.created_at, r.updated_at)
    }
  }
}

function _upsertSales(rows: Sale[]): void {
  const db: NxDB = getDb()
  const hasStore = columnExists(db, 'sales', 'store_id')
  const stmt = hasStore
    ? db.prepare(
        `INSERT OR REPLACE INTO sales
         (id, total_amount, payment_method, notes, seller_id, created_at, client_uuid, customer_id, store_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
    : db.prepare(
        `INSERT OR REPLACE INTO sales
         (id, total_amount, payment_method, notes, seller_id, created_at, client_uuid, customer_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
  for (const r of rows) {
    if (hasStore) {
      stmt.run(
        r.id,
        r.total_amount,
        r.payment_method,
        r.notes ?? null,
        r.seller_id,
        r.created_at,
        r.client_uuid ?? null,
        r.customer_id ?? null,
        r.store_id ?? null,
      )
    } else {
      stmt.run(
        r.id,
        r.total_amount,
        r.payment_method,
        r.notes ?? null,
        r.seller_id,
        r.created_at,
        r.client_uuid ?? null,
        r.customer_id ?? null,
      )
    }
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
      r.id,
      r.sale_id,
      r.product_id,
      r.quantity,
      r.unit_price,
      r.subtotal,
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
  for (const r of rows) {
    stmt.run(r.id, r.customer_id, r.amount, r.notes ?? null, r.recorded_by, r.created_at)
  }
}

function columnExists(db: NxDB, table: string, column: string): boolean {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    return rows.some((r) => r.name === column)
  } catch {
    return false
  }
}

/**
 * After a successful createSale() RPC, pulls that sale + items + product stock.
 * Prefer service role so o .exe grava a venda local mesmo com JWT fraco.
 */
export async function pullSingleSale(saleId: string): Promise<void> {
  const { getAdminDataClient } = await import('@/lib/supabase/admin-data')
  let supabase
  try {
    supabase = await getAdminDataClient()
  } catch {
    supabase = await createSyncClient()
  }
  const db = getDb()

  const [saleRes, itemsRes] = await Promise.all([
    supabase.from('sales').select('*').eq('id', saleId).maybeSingle(),
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
 * Grava venda + itens no SQLite imediatamente (sem rede) — usado no createSale
 * service role path.
 */
export function writeLocalSaleSnapshot(
  sale: Sale,
  items: Array<{
    id?: string
    sale_id: string
    product_id: string
    quantity: number
    unit_price: number
    subtotal: number
    item_description?: string | null
  }>,
): void {
  try {
    const db = getDb()
    const withIds: SaleItem[] = items.map((i) => ({
      id: i.id ?? crypto.randomUUID(),
      sale_id: i.sale_id,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
      subtotal: i.subtotal,
      item_description: i.item_description ?? null,
    }))
    db.transaction(() => {
      _upsertSales([sale])
      _upsertSaleItems(withIds)
    })()
  } catch (err) {
    console.warn('[electron] writeLocalSaleSnapshot failed:', err)
  }
}

/**
 * When a sale is cancelled, removes it from SQLite and restores product stock.
 */
export async function deleteLocalSale(saleId: string): Promise<void> {
  const db = getDb()

  const affectedProductIds = (
    db
      .prepare(`SELECT product_id FROM sale_items WHERE sale_id = ?`)
      .all(saleId) as { product_id: string }[]
  ).map((r) => r.product_id)

  db.transaction(() => {
    db.prepare(`DELETE FROM sale_items WHERE sale_id = ?`).run(saleId)
    db.prepare(`DELETE FROM sales WHERE id = ?`).run(saleId)
  })()

  if (affectedProductIds.length > 0) {
    try {
      const supabase = await createSyncClient()
      const { data } = await supabase.from('products').select('*').in('id', affectedProductIds)
      if (data && data.length > 0) _upsertProducts(data as Product[])
    } catch {
      // best-effort
    }
  }
}

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

      db.prepare(
        `UPDATE sync_queue SET status = 'synced', synced_at = ? WHERE id = ?`,
      ).run(new Date().toISOString(), item.id)
      pushed++
    } catch {
      const nextAttempts = item.attempts + 1
      db.prepare(`UPDATE sync_queue SET attempts = ?, status = ? WHERE id = ?`).run(
        nextAttempts,
        nextAttempts >= 3 ? 'error' : 'pending',
        item.id,
      )
    }
  }

  return pushed
}
