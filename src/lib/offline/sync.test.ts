import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Product, Category } from '@/types/database'

// Must be hoisted — mock registers before the tested module is imported.
const fromMock = vi.fn()
const rpcMock = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({ from: fromMock, rpc: rpcMock })),
}))

import { getDB } from './db'
import {
  syncProducts,
  syncCategories,
  syncCustomers,
  syncAll,
  getLastSync,
} from './sync'

// Build a mock Supabase query builder that is both chainable and awaitable.
function chain(result: { data: unknown; error: unknown }) {
  const obj = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then(
      resolve: (v: typeof result) => void,
      reject?: (e: unknown) => void,
    ) {
      return Promise.resolve(result).then(resolve, reject)
    },
    catch(onRejected: (reason: unknown) => void) {
      return Promise.resolve(result).catch(onRejected)
    },
  }
  obj.select.mockReturnValue(obj)
  obj.eq.mockReturnValue(obj)
  obj.order.mockReturnValue(obj)
  return obj
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: crypto.randomUUID(),
    code: '001',
    name: 'Produto',
    description: null,
    sale_price: 10,
    cost_price: 5,
    stock_quantity: 20,
    min_stock: 5,
    category_id: null,
    is_active: true,
    track_stock: true,
    image_url: null,
    store_id: 'store-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: crypto.randomUUID(),
    name: 'Categoria',
    store_id: 'store-1',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(async () => {
  const db = getDB()
  await db.products.clear()
  await db.categories.clear()
  await db.customers.clear()
  await db.syncMeta.clear()
  vi.clearAllMocks()
  rpcMock.mockResolvedValue({ data: 'store-1', error: null })
})

describe('syncProducts', () => {
  it('populates IndexedDB with rows returned by Supabase', async () => {
    const products = [makeProduct({ name: 'Café' }), makeProduct({ name: 'Pão' })]
    fromMock.mockReturnValue(chain({ data: products, error: null }))

    const result = await syncProducts()

    expect(result.synced).toBe(2)
    const stored = await getDB().products.toArray()
    expect(stored).toHaveLength(2)
    expect(stored.map((p) => p.name)).toEqual(expect.arrayContaining(['Café', 'Pão']))
  })

  it('replaces stale cache on each call', async () => {
    // Seed old data
    await getDB().products.add(makeProduct({ name: 'Velho' }))

    const fresh = [makeProduct({ name: 'Fresco' })]
    fromMock.mockReturnValue(chain({ data: fresh, error: null }))

    await syncProducts()

    const stored = await getDB().products.toArray()
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('Fresco')
  })

  it('stamps syncMeta after a successful sync', async () => {
    fromMock.mockReturnValue(chain({ data: [], error: null }))

    await syncProducts()

    const meta = await getDB().syncMeta.get('products')
    expect(meta?.key).toBe('products')
    expect(meta?.count).toBe(0)
    expect(meta?.lastSyncAt).toBeTruthy()
  })

  it('throws when Supabase returns an error', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: { message: 'DB down' } }))

    await expect(syncProducts()).rejects.toMatchObject({ message: 'DB down' })
  })
})

describe('syncCategories', () => {
  it('populates IndexedDB with categories', async () => {
    const categories = [makeCategory({ name: 'Bebidas' }), makeCategory({ name: 'Laticínios' })]
    fromMock.mockReturnValue(chain({ data: categories, error: null }))

    const result = await syncCategories()

    expect(result.synced).toBe(2)
    expect(await getDB().categories.count()).toBe(2)
  })
})

describe('syncAll', () => {
  it('returns synced counts for all three entities on success', async () => {
    fromMock.mockReturnValue(chain({ data: [], error: null }))

    const result = await syncAll()

    expect(result.products).toMatchObject({ synced: 0 })
    expect(result.categories).toMatchObject({ synced: 0 })
    expect(result.customers).toMatchObject({ synced: 0 })
  })

  it('captures a per-entity error without aborting the other syncs', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'products') {
        return chain({ data: null, error: new Error('products failed') })
      }
      return chain({ data: [], error: null })
    })

    const result = await syncAll()

    // products failed, others succeeded
    expect(result.products).toMatchObject({ error: 'products failed' })
    expect(result.categories).toMatchObject({ synced: 0 })
    expect(result.customers).toMatchObject({ synced: 0 })
  })
})

describe('getLastSync', () => {
  it('returns undefined when never synced', async () => {
    expect(await getLastSync('products')).toBeUndefined()
  })

  it('returns the metadata written by syncProducts', async () => {
    fromMock.mockReturnValue(chain({ data: [makeProduct()], error: null }))
    await syncProducts()

    const meta = await getLastSync('products')
    expect(meta?.key).toBe('products')
    expect(meta?.count).toBe(1)
    expect(typeof meta?.lastSyncAt).toBe('string')
  })
})
