/**
 * Local IndexedDB cache for offline reads.
 *
 * Mirrors the shape of `products` and `categories` from Supabase so the same
 * server types flow through the UI whether the data came from the network
 * or from the local cache. A small `syncMeta` table records the last-sync
 * timestamp for each entity, so we can show "last updated X minutes ago"
 * and decide when a background refresh is needed.
 *
 * This file is import-safe on the server (it only constructs the Dexie
 * instance when running in the browser) — Dexie itself is a thin wrapper
 * around `window.indexedDB`, which doesn't exist on the server.
 */

import 'client-only'
import Dexie, { type Table } from 'dexie'
import type { Product, Category, CustomerBalance, PaymentMethod } from '@/types/database'

/** Mirror of `public.products.Row`. Same shape so server types reuse cleanly. */
export type CachedProduct = Product

/** Mirror of `public.categories.Row`. */
export type CachedCategory = Category

/** Mirror of the `customer_balances` view — used for offline fiado search. */
export type CachedCustomer = CustomerBalance

/** One line of a queued offline sale. Carries enough to render a provisional
 *  receipt and to rebuild the RPC payload without re-reading the catalog. */
export interface PendingSaleItem {
  product_id: string
  quantity: number
  name: string
  unit_price: number
  item_description?: string
}

/**
 * A sale rung up while offline (or that failed to reach the server), waiting
 * to be flushed to Supabase. `id` is the client-generated UUID used as the
 * idempotency key by the `create_sale_with_items` RPC.
 */
export interface PendingSalePayment {
  method: Exclude<PaymentMethod, 'mixed'>
  amount: number
}

export interface PendingSale {
  id: string
  payment_method: PaymentMethod
  notes: string
  items: PendingSaleItem[]
  total: number
  /** Split tender lines (PIX + dinheiro, etc.). */
  payments?: PendingSalePayment[]
  /** UUID of the customer for fiado sales; null/undefined for regular sales. */
  customer_id?: string | null
  createdAt: string // ISO timestamp
  /** `pending` = waiting to sync; `failed` = server rejected (e.g. stock), needs review. */
  status: 'pending' | 'failed'
  /** Last error surfaced by the server, when status is `failed`. */
  error?: string
  /** How many flush attempts have run, for backoff/diagnostics. */
  attempts: number
}

/**
 * One row per entity (`products`, `categories`), tracking the last time a
 * full refresh completed. Used by the sync layer to debounce refreshes
 * and by the UI to render "última sincronização há X".
 */
export interface SyncMeta {
  key: 'products' | 'categories' | 'customers'
  lastSyncAt: string // ISO timestamp
  count: number
}

class VendasAppDB extends Dexie {
  products!: Table<CachedProduct, string>
  categories!: Table<CachedCategory, string>
  customers!: Table<CachedCustomer, string>
  syncMeta!: Table<SyncMeta, string>
  pendingSales!: Table<PendingSale, string>

  constructor() {
    super('vendas-app')
    // v1 — initial offline cache schema. Bump and add `.upgrade(...)` blocks
    // here when the local schema changes; never edit a past version.
    this.version(1).stores({
      products: 'id, code, name, is_active',
      categories: 'id, name',
      syncMeta: 'key',
    })
    // v2 — offline write queue.
    this.version(2).stores({
      products: 'id, code, name, is_active',
      categories: 'id, name',
      syncMeta: 'key',
      pendingSales: 'id, status, createdAt',
    })
    // v3 — customer cache for offline fiado sales. `full_name` and `phone`
    // indexed so the PDV search doesn't require a full table scan.
    this.version(3).stores({
      products: 'id, code, name, is_active',
      categories: 'id, name',
      syncMeta: 'key',
      pendingSales: 'id, status, createdAt',
      customers: 'id, full_name, phone',
    })
  }
}

/**
 * Singleton Dexie instance. Lazily constructed on the client so that
 * importing this module on the server (e.g. accidentally from a Server
 * Component) doesn't crash on `window.indexedDB` being undefined.
 */
let _db: VendasAppDB | null = null

export function getDB(): VendasAppDB {
  if (typeof window === 'undefined') {
    throw new Error(
      'getDB() called on the server. Offline cache is browser-only — guard the import with a "use client" boundary or a typeof window check.',
    )
  }
  if (!_db) _db = new VendasAppDB()
  return _db
}
