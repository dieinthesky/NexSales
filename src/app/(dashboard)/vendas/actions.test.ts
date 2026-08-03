import { describe, it, expect, beforeEach, vi } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: rpcMock })),
  createSyncClient: vi.fn(async () => ({ rpc: rpcMock })),
}))
vi.mock('@/lib/auth/roles', () => ({
  getCurrentUser: vi.fn(async () => ({
    id: 'user-1',
    email: 'a@b.com',
    role: 'admin',
    storeId: 'store-1',
    storeName: 'Loja',
    firstName: null,
    lastName: null,
    displayName: 'A',
    initials: 'A',
  })),
  isAdmin: vi.fn(async () => true),
}))
vi.mock('@/lib/db/client', () => ({ isElectron: vi.fn(() => false) }))
vi.mock('@/lib/db/sync', () => ({
  pullSingleSale: vi.fn(),
  deleteLocalSale: vi.fn(),
}))
vi.mock('@/lib/supabase/service', () => ({
  tryCreateServiceClient: vi.fn(() => null),
  createServiceClient: vi.fn(),
}))

import { createSale } from './actions'

const validInput = {
  payment_method: 'cash' as const,
  notes: '',
  items: [{ product_id: 'p1', quantity: 2 }],
}

beforeEach(() => {
  rpcMock.mockReset()
})

describe('createSale', () => {
  it('returns the sale id on success', async () => {
    rpcMock.mockResolvedValue({ data: 'sale-123', error: null })
    const result = await createSale(validInput)
    expect(result).toEqual({ saleId: 'sale-123' })
  })

  it('forwards the client_uuid as the idempotency key', async () => {
    rpcMock.mockResolvedValue({ data: 'sale-123', error: null })
    await createSale({ ...validInput, client_uuid: 'uuid-abc' })
    expect(rpcMock).toHaveBeenCalledWith(
      'create_sale_with_items',
      expect.objectContaining({ p_client_uuid: 'uuid-abc' }),
    )
  })

  it('defaults client_uuid to null when omitted', async () => {
    rpcMock.mockResolvedValue({ data: 'sale-123', error: null })
    await createSale(validInput)
    expect(rpcMock).toHaveBeenCalledWith(
      'create_sale_with_items',
      expect.objectContaining({ p_client_uuid: null }),
    )
  })

  it('maps insufficient_stock to a friendly message + code', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'insufficient_stock:Coca-Cola' } })
    const result = await createSale(validInput)
    expect(result.code).toBe('insufficient_stock')
    expect(result.error).toBe('Estoque insuficiente para: Coca-Cola')
  })

  it('maps product_not_found', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'product_not_found:p1' } })
    const result = await createSale(validInput)
    expect(result.code).toBe('product_not_found')
  })

  it('maps empty_cart', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'empty_cart' } })
    const result = await createSale(validInput)
    expect(result.code).toBe('empty_cart')
  })

  it('maps unauthenticated', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'unauthenticated' } })
    const result = await createSale(validInput)
    expect(result.code).toBe('unauthenticated')
  })

  it('falls back to code "unknown" for unexpected errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'some db explosion' } })
    const result = await createSale(validInput)
    expect(result.code).toBe('unknown')
    expect(result.error).toBe('some db explosion')
  })
})
