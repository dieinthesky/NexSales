import 'server-only'
import { getDb } from '../client'
import { brDayRangeUTC } from '@/lib/utils/datetime'
import type { PaymentMethod, Sale, SaleWithItems, Product } from '@/types/database'
import type { SalesListParams, SalesListResult } from '@/lib/queries/sales'

const DEFAULT_PAGE_SIZE = 25

interface RawSaleRow {
  id: string
  total_amount: number
  payment_method: string
  notes: string | null
  seller_id: string
  created_at: string
  client_uuid: string | null
  customer_id: string | null
}

interface RawSaleItemRow {
  id: string
  sale_id: string
  product_id: string
  quantity: number
  unit_price: number
  subtotal: number
  item_description: string | null
  prod_id: string
  code: string
  prod_name: string
  description: string | null
  sale_price: number
  cost_price: number | null
  stock_quantity: number
  min_stock: number
  category_id: string | null
  is_active: number
  track_stock: number
  image_url: string | null
  prod_created_at: string
  prod_updated_at: string
}

export function getSalesPaged(params: SalesListParams = {}): SalesListResult {
  const db = getDb()
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.max(1, Math.min(100, params.pageSize ?? DEFAULT_PAGE_SIZE))
  const offset = (page - 1) * pageSize

  const conditions: string[] = []
  const bindParams: unknown[] = []

  if (params.payment) {
    conditions.push(`payment_method = ?`)
    bindParams.push(params.payment)
  }

  if (params.day) {
    const { start, end } = brDayRangeUTC(params.day)
    conditions.push(`created_at >= ? AND created_at <= ?`)
    bindParams.push(start, end)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM sales ${where}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .get(...(bindParams as any[])) as { total: number }

  const rows = db
    .prepare(`SELECT * FROM sales ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .all(...(bindParams as any[]), pageSize, offset) as RawSaleRow[]

  const total = countRow.total
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: rows as unknown as Sale[],
    total,
    page,
    pageSize,
    totalPages,
  }
}

export function getSaleById(id: string): SaleWithItems | null {
  const db = getDb()

  const sale = db
    .prepare(`SELECT * FROM sales WHERE id = ?`)
    .get(id) as RawSaleRow | undefined
  if (!sale) return null

  const itemRows = db
    .prepare(
      `SELECT
        si.id, si.sale_id, si.product_id, si.quantity, si.unit_price, si.subtotal,
        si.item_description,
        p.id AS prod_id, p.code, p.name AS prod_name, p.description,
        p.sale_price, p.cost_price, p.stock_quantity, p.min_stock,
        p.category_id, p.is_active, p.track_stock, p.image_url,
        p.created_at AS prod_created_at, p.updated_at AS prod_updated_at
       FROM sale_items si
       LEFT JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = ?`,
    )
    .all(id) as RawSaleItemRow[]

  const customer = sale.customer_id
    ? (db
        .prepare(`SELECT full_name FROM customers WHERE id = ?`)
        .get(sale.customer_id) as { full_name: string } | undefined)
    : undefined

  return {
    ...(sale as unknown as Sale),
    customers: customer ? { full_name: customer.full_name } : null,
    sale_items: itemRows.map((item) => ({
      id: item.id,
      sale_id: item.sale_id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
      item_description: item.item_description,
      products: {
        id: item.prod_id ?? item.product_id,
        code: item.code ?? '—',
        name: item.prod_name ?? 'Produto removido',
        description: item.description ?? null,
        sale_price: item.sale_price ?? item.unit_price,
        cost_price: item.cost_price ?? 0,
        stock_quantity: item.stock_quantity ?? 0,
        min_stock: item.min_stock ?? 0,
        category_id: item.category_id ?? null,
        is_active: item.is_active === 1,
        track_stock: item.track_stock !== 0,
        image_url: item.image_url ?? null,
        created_at: item.prod_created_at ?? sale.created_at,
        updated_at: item.prod_updated_at ?? sale.created_at,
      } as Product,
    })),
  }
}

export function getTopProducts(limit = 5) {
  const db = getDb()

  interface TopRow {
    product_id: string
    total: number
    name: string
    code: string
  }

  const rows = db
    .prepare(
      `SELECT si.product_id, SUM(si.quantity) AS total, p.name, p.code
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       GROUP BY si.product_id
       ORDER BY total DESC
       LIMIT ?`,
    )
    .all(limit) as TopRow[]

  return rows.map((r) => ({ id: r.product_id, name: r.name, code: r.code, total: r.total }))
}
