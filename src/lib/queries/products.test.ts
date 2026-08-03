/**
 * getProductsPaged / getCategories: nuvem primeiro; SQLite se falhar no Electron.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Category, ProductWithCategory } from '@/types/database'

vi.mock('@/lib/db/client', () => ({ isElectron: vi.fn() }))
vi.mock('@/lib/db/queries/products', () => ({
  getProductsPaged: vi.fn(),
  getLowStock: vi.fn(),
  getCategories: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockRejectedValue(new Error('Supabase down')),
}))
vi.mock('@/lib/supabase/admin-data', () => ({
  getAdminDataClient: vi.fn().mockRejectedValue(new Error('no admin')),
  resolveAdminContext: vi.fn(),
}))
vi.mock('@/lib/auth/roles', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/queries/categories', () => ({
  listCategoriesForCurrentStore: vi.fn().mockRejectedValue(new Error('no cats')),
}))

import { isElectron } from '@/lib/db/client'
import * as sqliteQueries from '@/lib/db/queries/products'
import { getProductsPaged, getLowStock, getCategories } from '@/lib/queries/products'
import { listCategoriesForCurrentStore } from '@/lib/queries/categories'

const isElectronMock = vi.mocked(isElectron)
const sqliteGetProductsPaged = vi.mocked(sqliteQueries.getProductsPaged)
const sqliteGetLowStock = vi.mocked(sqliteQueries.getLowStock)
const sqliteGetCategories = vi.mocked(sqliteQueries.getCategories)
const listCatsMock = vi.mocked(listCategoriesForCurrentStore)

const EMPTY_PAGED = {
  items: [] as ProductWithCategory[],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
}
const EMPTY_PRODUCTS: ProductWithCategory[] = []

beforeEach(() => {
  vi.clearAllMocks()
  isElectronMock.mockReturnValue(false)
  listCatsMock.mockRejectedValue(new Error('no cats'))
})

describe('getProductsPaged — Electron offline fallback', () => {
  it('uses SQLite when cloud fails on Electron', async () => {
    isElectronMock.mockReturnValue(true)
    sqliteGetProductsPaged.mockReturnValue(EMPTY_PAGED)
    const result = await getProductsPaged()
    expect(sqliteGetProductsPaged).toHaveBeenCalledOnce()
    expect(result).toEqual(EMPTY_PAGED)
  })
})

describe('getLowStock — Electron offline fallback', () => {
  it('uses SQLite when cloud fails', async () => {
    isElectronMock.mockReturnValue(true)
    sqliteGetLowStock.mockReturnValue(EMPTY_PRODUCTS)
    const result = await getLowStock()
    expect(sqliteGetLowStock).toHaveBeenCalledOnce()
    expect(result).toEqual(EMPTY_PRODUCTS)
  })
})

describe('getCategories', () => {
  it('returns cloud categories when available', async () => {
    const cats: Category[] = [
      { id: 'c-1', name: 'Bebidas', store_id: 'store-1', created_at: '2026-01-01T00:00:00Z' },
    ]
    listCatsMock.mockResolvedValue(cats)
    const result = await getCategories()
    expect(result).toEqual(cats)
  })

  it('falls back to SQLite on Electron when cloud empty/fail', async () => {
    isElectronMock.mockReturnValue(true)
    listCatsMock.mockResolvedValue([])
    const cats: Category[] = [
      { id: 'c-1', name: 'Bebidas', store_id: 'store-1', created_at: '2026-01-01T00:00:00Z' },
    ]
    sqliteGetCategories.mockReturnValue(cats)
    const result = await getCategories()
    expect(result[0].name).toBe('Bebidas')
  })
})
