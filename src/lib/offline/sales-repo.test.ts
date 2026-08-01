import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Product } from '@/types/database'

// Replace the server action and the read-sync so the queue logic is tested in
// isolation (no Supabase, no network).
vi.mock('@/app/(dashboard)/vendas/actions', () => ({ createSale: vi.fn() }))
vi.mock('./sync', () => ({ syncProducts: vi.fn().mockResolvedValue({ synced: 0, at: '' }) }))

import { getDB } from './db'
import { createSale } from '@/app/(dashboard)/vendas/actions'
import { syncProducts } from './sync'
import {
  queueSale,
  getPendingCount,
  flushPendingSales,
} from './sales-repo'

const createSaleMock = vi.mocked(createSale)

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
    image_url: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/** Seed one product and queue a sale of `qty` units of it. Returns ids. */
async function seedAndQueue(qty = 3) {
  const db = getDB()
  const product = makeProduct({ stock_quantity: 10, sale_price: 5 })
  await db.products.add(product)
  const clientUuid = crypto.randomUUID()
  await queueSale({
    client_uuid: clientUuid,
    payment_method: 'cash',
    notes: '',
    total: qty * 5,
    items: [
      { product_id: product.id, quantity: qty, name: product.name, unit_price: 5 },
    ],
  })
  return { productId: product.id, clientUuid }
}

beforeEach(async () => {
  const db = getDB()
  await db.products.clear()
  await db.pendingSales.clear()
  vi.clearAllMocks()
})

describe('queueSale', () => {
  it('stores a pending sale and decrements local stock optimistically', async () => {
    const { productId } = await seedAndQueue(3)

    const db = getDB()
    const pending = await db.pendingSales.toArray()
    expect(pending).toHaveLength(1)
    expect(pending[0].status).toBe('pending')
    expect(pending[0].attempts).toBe(0)

    const product = await db.products.get(productId)
    expect(product?.stock_quantity).toBe(7) // 10 - 3
  })

  it('never lets local stock go negative', async () => {
    const db = getDB()
    const product = makeProduct({ stock_quantity: 1 })
    await db.products.add(product)
    await queueSale({
      client_uuid: crypto.randomUUID(),
      payment_method: 'cash',
      notes: '',
      total: 25,
      items: [{ product_id: product.id, quantity: 5, name: product.name, unit_price: 5 }],
    })
    const updated = await db.products.get(product.id)
    expect(updated?.stock_quantity).toBe(0)
  })

  it('does not decrement stock for products with track_stock=false', async () => {
    const db = getDB()
    const product = makeProduct({ stock_quantity: 0, track_stock: false })
    await db.products.add(product)
    await queueSale({
      client_uuid: crypto.randomUUID(),
      payment_method: 'cash',
      notes: '',
      total: 10,
      items: [{ product_id: product.id, quantity: 2, name: product.name, unit_price: 5 }],
    })
    const updated = await db.products.get(product.id)
    expect(updated?.stock_quantity).toBe(0)
  })
})

describe('getPendingCount', () => {
  it('counts pending and failed separately', async () => {
    await seedAndQueue(1)
    expect(await getPendingCount()).toEqual({ pending: 1, failed: 0 })
  })
})

describe('flushPendingSales', () => {
  it('sends the sale with its client_uuid and clears it on success', async () => {
    const { clientUuid } = await seedAndQueue(2)
    createSaleMock.mockResolvedValue({ saleId: 'server-id-1' })

    const result = await flushPendingSales()

    expect(result).toEqual({ synced: 1, failed: 0 })
    expect(createSaleMock).toHaveBeenCalledWith(
      expect.objectContaining({ client_uuid: clientUuid }),
    )
    expect(await getPendingCount()).toEqual({ pending: 0, failed: 0 })
    // Pulls authoritative stock after a successful sync.
    expect(syncProducts).toHaveBeenCalled()
  })

  it('marks a sale as failed on a terminal error (e.g. insufficient stock)', async () => {
    await seedAndQueue(2)
    createSaleMock.mockResolvedValue({
      error: 'Estoque insuficiente para: X',
      code: 'insufficient_stock',
    })

    const result = await flushPendingSales()

    expect(result).toEqual({ synced: 0, failed: 1 })
    expect(await getPendingCount()).toEqual({ pending: 0, failed: 1 })
    expect(syncProducts).toHaveBeenCalled() // reconcile stock after a terminal failure
  })

  it('keeps the sale pending on a transient (network) error', async () => {
    await seedAndQueue(2)
    createSaleMock.mockRejectedValue(new Error('network down'))

    const result = await flushPendingSales()

    expect(result).toEqual({ synced: 0, failed: 0 })
    const counts = await getPendingCount()
    expect(counts.pending).toBe(1)
    expect(counts.failed).toBe(0)

    const db = getDB()
    const [sale] = await db.pendingSales.toArray()
    expect(sale.attempts).toBe(1) // attempt counter bumped for diagnostics
  })

  describe('when offline', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    })
    afterEach(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    })

    it('does not contact the server', async () => {
      await seedAndQueue(1)
      const result = await flushPendingSales()
      expect(result).toEqual({ synced: 0, failed: 0 })
      expect(createSaleMock).not.toHaveBeenCalled()
    })
  })
})
