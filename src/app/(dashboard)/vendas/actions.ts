'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/auth/roles'
import { isElectron } from '@/lib/db/client'
import { pullSingleSale, deleteLocalSale } from '@/lib/db/sync'
import type { Json, PaymentMethod } from '@/types/database'

interface SaleItem {
  product_id: string
  quantity: number
  unit_price?: number
  item_description?: string
}

export interface SalePaymentInput {
  method: Exclude<PaymentMethod, 'mixed'>
  amount: number
}

interface CreateSaleInput {
  payment_method: PaymentMethod
  notes: string
  items: SaleItem[]
  /** Idempotency key for offline sales. Null/omitted for normal online sales. */
  client_uuid?: string
  /** Required when payment_method is 'fiado' (or any fiado line). */
  customer_id?: string | null
  /** Split tender lines. When omitted, server records one line = full total. */
  payments?: SalePaymentInput[]
}

/**
 * Stable error codes returned alongside the user-facing message, so callers
 * (e.g. the offline flush) can classify failures without parsing translated
 * strings. `terminal` codes won't succeed on retry; everything else is treated
 * as transient.
 */
export type CreateSaleErrorCode =
  | 'insufficient_stock'
  | 'product_not_found'
  | 'empty_cart'
  | 'unauthenticated'
  | 'customer_required'
  | 'payment_mismatch'
  | 'unknown'

export interface CreateSaleResult {
  saleId?: string
  error?: string
  code?: CreateSaleErrorCode
}

function mapCreateSaleError(msg: string): CreateSaleResult {
  if (msg.includes('insufficient_stock')) {
    const product = msg.split(':')[1]?.trim() ?? 'produto'
    return { error: `Estoque insuficiente para: ${product}`, code: 'insufficient_stock' }
  }
  if (msg.includes('product_not_found')) {
    return { error: 'Produto não encontrado.', code: 'product_not_found' }
  }
  if (msg.includes('empty_cart')) {
    return { error: 'Adicione pelo menos um produto.', code: 'empty_cart' }
  }
  if (msg.includes('unauthenticated')) {
    return { error: 'Sessão expirada. Faça login novamente.', code: 'unauthenticated' }
  }
  if (msg.includes('customer_required')) {
    return { error: 'Selecione um cliente para venda fiada.', code: 'customer_required' }
  }
  if (msg.includes('payment_mismatch') || msg.includes('invalid_payment')) {
    return {
      error: 'Soma das formas de pagamento deve fechar o total da venda.',
      code: 'payment_mismatch',
    }
  }
  if (msg.includes('Could not find the function') || msg.includes('schema cache')) {
    return {
      error:
        'Falta atualizar o banco (SQL do pagamento misto). Rode a migration no Supabase e tente de novo.',
      code: 'unknown',
    }
  }
  return { error: msg, code: 'unknown' }
}

export async function createSale(input: CreateSaleInput): Promise<CreateSaleResult> {
  const supabase = await createClient()

  const baseArgs = {
    p_payment_method: input.payment_method,
    p_notes: input.notes || null,
    p_items: input.items as unknown as Json,
    p_client_uuid: input.client_uuid ?? null,
    p_customer_id: input.customer_id ?? null,
  }

  // Tenta a RPC nova (com p_payments). Se o Supabase ainda não tem a migration,
  // cai na assinatura antiga — só funciona bem com 1 forma de pagamento.
  let { data, error } = await supabase.rpc('create_sale_with_items', {
    ...baseArgs,
    p_payments: (input.payments ?? null) as unknown as Json,
  })

  if (
    error &&
    (error.message.includes('Could not find the function') ||
      error.message.includes('schema cache'))
  ) {
    if ((input.payments?.length ?? 0) > 1) {
      return {
        error:
          'Pagamento misto precisa do SQL no Supabase. Abra o SQL Editor e rode a migration 20260801000000_sale_payments_split.sql',
        code: 'unknown',
      }
    }
    ;({ data, error } = await supabase.rpc('create_sale_with_items', baseArgs))
  }

  if (error) {
    return mapCreateSaleError(error.message)
  }

  if (typeof data !== 'string' || !data) {
    return { error: 'Erro interno: resposta inesperada do servidor.', code: 'unknown' }
  }
  const saleId = data

  // In Electron, pages read from SQLite — pull the new sale into SQLite immediately
  // so Histórico and Dashboard reflect the sale without waiting for the next periodic sync.
  if (isElectron()) {
    await pullSingleSale(saleId).catch((err) => {
      console.warn('[electron] pullSingleSale failed, will sync on next cycle:', err)
    })
  }

  revalidatePath('/vendas')
  revalidatePath('/produtos')
  revalidatePath('/dashboard')
  if (input.customer_id) {
    revalidatePath('/clientes')
    revalidatePath(`/clientes/${input.customer_id}`)
  }

  return { saleId }
}

export interface CancelSaleResult {
  success: boolean
  error?: string
}

/**
 * Cancel (delete) a sale and restore product stock.
 *
 * Authorization is enforced twice — once here for a fast fail with a friendly
 * message, and again inside the `cancel_sale` Postgres function (defense in
 * depth: the RPC raises 42501 if `is_admin()` is false).
 *
 * Stock restoration + delete happens inside a single SQL function so the
 * operation is atomic — no risk of restoring stock and then failing to delete
 * the sale, or vice-versa.
 */
export async function cancelSale(saleId: string): Promise<CancelSaleResult> {
  if (!(await isAdmin())) {
    return {
      success: false,
      error: 'Apenas administradores podem excluir vendas.',
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_sale', { p_sale_id: saleId })

  if (error) {
    if (error.message.includes('sale_not_found')) {
      return { success: false, error: 'Venda não encontrada.' }
    }
    if (error.message.includes('forbidden')) {
      return {
        success: false,
        error: 'Apenas administradores podem excluir vendas.',
      }
    }
    return { success: false, error: error.message }
  }

  // In Electron, delete the sale from SQLite immediately and restore product stock.
  if (isElectron()) {
    await deleteLocalSale(saleId).catch((err) => {
      console.warn('[electron] deleteLocalSale failed, will sync on next cycle:', err)
    })
  }

  // Invalidate every surface that derives data from sales/stock/fiado.
  revalidatePath('/vendas')
  revalidatePath(`/vendas/${saleId}`)
  revalidatePath('/dashboard')
  revalidatePath('/produtos')
  revalidatePath('/clientes')

  return { success: true }
}
