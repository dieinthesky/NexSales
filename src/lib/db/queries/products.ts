import 'server-only'
import { getDb } from '../client'
import type { Category, ProductWithCategory } from '@/types/database'
import type { ProductsListParams, ProductsListResult } from '@/lib/queries/products'

const DEFAULT_PAGE_SIZE = 20

interface RawProductRow {
  id: string
  code: string
  name: string
  description: string | null
  sale_price: number
  cost_price: number
  stock_quantity: number
  min_stock: number
  category_id: string | null
  is_active: number
  track_stock: number
  created_at: string
  updated_at: string
  cat_id: string | null
  cat_name: string | null
  cat_created_at: string | null
}

function mapProductRow(row: RawProductRow): ProductWithCategory {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    sale_price: row.sale_price,
    cost_price: row.cost_price,
    stock_quantity: row.stock_quantity,
    min_stock: row.min_stock,
    category_id: row.category_id,
    is_active: row.is_active === 1,
    track_stock: row.track_stock === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
    categories: row.cat_id
      ? { id: row.cat_id, name: row.cat_name!, created_at: row.cat_created_at! }
      : null,
  }
}

export function getProductsPaged(params: ProductsListParams = {}): ProductsListResult {
  const db = getDb()
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.max(1, Math.min(100, params.pageSize ?? DEFAULT_PAGE_SIZE))
  const offset = (page - 1) * pageSize

  const conditions: string[] = ['p.is_active = 1']
  const bindParams: unknown[] = []

  if (params.search) {
    const s = `%${params.search.replace(/[%_\\]/g, ' ')}%`
    conditions.push(`(p.name LIKE ? OR p.code LIKE ?)`)
    bindParams.push(s, s)
  }

  if (params.categoryId) {
    conditions.push(`p.category_id = ?`)
    bindParams.push(params.categoryId)
  }

  if (params.stock === 'out') {
    conditions.push(`COALESCE(p.track_stock, 1) = 1 AND p.stock_quantity <= 0`)
  } else if (params.stock === 'low') {
    conditions.push(
      `COALESCE(p.track_stock, 1) = 1 AND p.stock_quantity > 0 AND p.stock_quantity <= p.min_stock`,
    )
  } else if (params.stock === 'ok') {
    conditions.push(`COALESCE(p.track_stock, 1) = 1 AND p.stock_quantity > p.min_stock`)
  }

  const where = `WHERE ${conditions.join(' AND ')}`

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM products p ${where}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .get(...(bindParams as any[])) as { total: number }

  const rows = db
    .prepare(
      `SELECT p.*,
              c.id AS cat_id, c.name AS cat_name, c.created_at AS cat_created_at
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ${where}
       ORDER BY p.name
       LIMIT ? OFFSET ?`,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .all(...(bindParams as any[]), pageSize, offset) as RawProductRow[]

  const total = countRow.total
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return { items: rows.map(mapProductRow), total, page, pageSize, totalPages }
}

export function getLowStock(): ProductWithCategory[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT p.*,
              c.id AS cat_id, c.name AS cat_name, c.created_at AS cat_created_at
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.is_active = 1
         AND COALESCE(p.track_stock, 1) = 1
         AND p.stock_quantity <= p.min_stock
       ORDER BY p.stock_quantity
       LIMIT 50`,
    )
    .all() as RawProductRow[]
  return rows.map(mapProductRow)
}

export function getCategories(): Category[] {
  const db = getDb()
  return db.prepare(`SELECT * FROM categories ORDER BY name`).all() as Category[]
}
