/**
 * Offline sales queue: write-side counterpart to `products-repo.ts`.
 *
 * Sales rung up without a connection are stored in IndexedDB (`pendingSales`)
 * and flushed to Supabase when the network returns. The server stays the
 * source of truth: each queued sale carries a client-generated UUID that the
 * `create_sale_with_items` RPC treats as an idempotency key, so a retry after
 * a partial failure never double-inserts.
 *
 * Browser-only: `getDB()` throws on the server. Import from client components.
 */

import 'client-only'
import { getDB, type PendingSale, type PendingSaleItem } from './db'
import { syncProducts } from './sync'
import { createSale, type CreateSaleResult } from '@/app/(dashboard)/vendas/actions'
import type { PaymentMethod } from '@/types/database'

export interface QueueSaleInput {
  /** Client-generated UUID — also the idempotency key sent to the server. */
  client_uuid: string
  payment_method: PaymentMethod
  notes: string
  items: PendingSaleItem[]
  total: number
  customer_id?: string | null
}

/**
 * Persist a sale locally and optimistically decrement cached stock so the same
 * device can't oversell the same units across multiple offline sales. The
 * authoritative stock is restored from the server after a successful flush.
 */
export async function queueSale(input: QueueSaleInput): Promise<void> {
  const db = getDB()
  const sale: PendingSale = {
    id: input.client_uuid,
    payment_method: input.payment_method,
    notes: input.notes,
    items: input.items,
    total: input.total,
    customer_id: input.customer_id ?? null,
    createdAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
  }

  await db.transaction('rw', db.pendingSales, db.products, async () => {
    await db.pendingSales.put(sale)
    for (const item of input.items) {
      const product = await db.products.get(item.product_id)
      if (product?.track_stock) {
        await db.products.update(item.product_id, {
          stock_quantity: Math.max(0, product.stock_quantity - item.quantity),
        })
      }
    }
  })

  // Let the header badge update immediately.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('pendingsaleschange'))
  }
}

/** Counts split by status, for the header badge. */
export async function getPendingCount(): Promise<{ pending: number; failed: number }> {
  const all = await getDB().pendingSales.toArray()
  return {
    pending: all.filter((s) => s.status === 'pending').length,
    failed: all.filter((s) => s.status === 'failed').length,
  }
}

/** An error the server won't recover from on retry — needs human action. */
// Server error codes that won't succeed on retry — the sale needs human review
// (e.g. stock sold out elsewhere) rather than being re-sent forever. Anything
// else (network drop, unknown, expired session) is transient and retried later.
const TERMINAL_CODES: ReadonlySet<string> = new Set([
  'insufficient_stock',
  'product_not_found',
  'empty_cart',
  'customer_required',
])

// Guards against overlapping flushes — SyncProvider can trigger on mount,
// `online`, and `visibilitychange` nearly simultaneously.
let flushing = false

/**
 * Send every `pending` sale to the server, in order. Outcomes per sale:
 *   - success → removed from the queue.
 *   - terminal error (e.g. stock sold out elsewhere) → marked `failed` for
 *     manual review; never retried automatically.
 *   - transient error (network) → left `pending`, attempts bumped, loop stops.
 *
 * After any success, re-pulls products so local stock matches the server.
 * `failed` sales are skipped — they require a human decision.
 */
export async function flushPendingSales(): Promise<{ synced: number; failed: number }> {
  if (flushing) return { synced: 0, failed: 0 }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, failed: 0 }
  }

  flushing = true
  let synced = 0
  let failed = 0

  try {
    const db = getDB()
    const pending = await db.pendingSales
      .where('status')
      .equals('pending')
      .sortBy('createdAt')

    for (const sale of pending) {
      const result: CreateSaleResult = await createSale({
        payment_method: sale.payment_method,
        notes: sale.notes,
        items: sale.items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          ...(i.item_description ? { item_description: i.item_description } : {}),
        })),
        client_uuid: sale.id,
        customer_id: sale.customer_id ?? null,
      }).catch((err: unknown) => ({
        // A thrown call means the request never reached the server (network).
        error: err instanceof Error ? err.message : 'network',
        code: 'unknown' as const,
      }))

      if (result.saleId) {
        await db.pendingSales.delete(sale.id)
        synced++
        continue
      }

      // Classify by the stable server code, not the translated message.
      if (result.code && TERMINAL_CODES.has(result.code)) {
        await db.pendingSales.update(sale.id, {
          status: 'failed',
          error: result.error ?? 'Venda rejeitada pelo servidor',
          attempts: sale.attempts + 1,
        })
        failed++
      } else {
        // Transient (network / unknown / expired session) — stop hammering and
        // retry on the next flush trigger.
        await db.pendingSales.update(sale.id, { attempts: sale.attempts + 1 })
        break
      }
    }

    // Always pull authoritative stock after a flush attempt — even when the
    // queue was empty. Other devices/sessions may have changed stock since
    // the last refresh, and the Electron shell doesn't fire `online` /
    // `visibilitychange` often enough to keep the cache fresh on its own.
    await syncProducts().catch(() => {})
  } finally {
    flushing = false
  }

  return { synced, failed }
}
