import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Product } from '@/types/database'

// Mock the sync layer so ensureProductsCached doesn't reach Supabase.
vi.mock('./sync', () => ({
  syncProducts: vi.fn().mockResolvedValue({ synced: 0, at: '' }),
}))

import { getDB } from './db'
import { syncProducts } from './sync'
import { searchProducts, getByCode, ensureProductsCached } from './products-repo'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: crypto.randomUUID(),
    code: '0001',
    name: 'Produto',
    description: null,
    sale_price: 5,
    cost_price: 3,
    stock_quantity: 10,
    min_stock: 2,
    category_id: null,
    is_active: true,
    track_stock: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(async () => {
  const db = getDB()
  await db.products.clear()
  await db.syncMeta.clear()
  vi.clearAllMocks()
})

describe('searchProducts', () => {
  beforeEach(async () => {
    const db = getDB()
    await db.products.bulkAdd([
      makeProduct({ code: '111', name: 'Coca-Cola Lata' }),
      makeProduct({ code: '222', name: 'Coca-Cola 2L' }),
      makeProduct({ code: '333', name: 'Água Mineral' }),
      makeProduct({ code: '444', name: 'Inativo', is_active: false }),
      makeProduct({ code: '555', name: 'Sem Estoque', stock_quantity: 0 }),
    ])
  })

  it('finds products by name substring (case-insensitive)', async () => {
    const results = await searchProducts('coca')
    expect(results).toHaveLength(2)
    expect(results.map((p) => p.name)).toContain('Coca-Cola Lata')
  })

  it('finds a product by its code', async () => {
    const results = await searchProducts('333')
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Água Mineral')
  })

  it('excludes inactive products and out-of-stock products', async () => {
    expect(await searchProducts('Inativo')).toHaveLength(0)
    expect(await searchProducts('Sem Estoque')).toHaveLength(0)
  })

  it('includes untracked products even when stock is 0', async () => {
    const db = getDB()
    await db.products.add(
      makeProduct({ code: 'AVU', name: 'Avulso Offline', stock_quantity: 0, track_stock: false }),
    )
    const results = await searchProducts('Avulso Offline')
    expect(results).toHaveLength(1)
    expect(results[0].code).toBe('AVU')
  })

  it('returns an empty array for a blank query', async () => {
    expect(await searchProducts('   ')).toHaveLength(0)
  })

  it('respects the limit', async () => {
    const results = await searchProducts('coca', 1)
    expect(results).toHaveLength(1)
  })
})

describe('getByCode', () => {
  it('returns the active product for an exact code', async () => {
    const db = getDB()
    await db.products.add(makeProduct({ code: '7891000', name: 'Leite' }))
    const found = await getByCode('7891000')
    expect(found?.name).toBe('Leite')
  })

  it('returns null for an unknown code', async () => {
    expect(await getByCode('does-not-exist')).toBeNull()
  })

  it('returns null for an inactive product', async () => {
    const db = getDB()
    await db.products.add(makeProduct({ code: 'OFF', is_active: false }))
    expect(await getByCode('OFF')).toBeNull()
  })
})

describe('ensureProductsCached', () => {
  it('does nothing when the cache already has products and meta is fresh', async () => {
    const db = getDB()
    await db.products.add(makeProduct())
    await db.syncMeta.put({ key: 'products', lastSyncAt: new Date().toISOString(), count: 1 })
    await ensureProductsCached()
    expect(syncProducts).not.toHaveBeenCalled()
  })

  it('syncs once when the cache is empty and online', async () => {
    await ensureProductsCached()
    expect(syncProducts).toHaveBeenCalledTimes(1)
  })
})
