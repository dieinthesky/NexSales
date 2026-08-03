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
  if (
    msg.includes('invalid input value for enum payment_method') &&
    msg.toLowerCase().includes('mixed')
  ) {
    return {
      error:
        'Falta o valor "mixed" no banco. No Supabase SQL Editor rode só isto e tente de novo: ALTER TYPE public.payment_method ADD VALUE \'mixed\';',
      code: 'unknown',
    }
  }
  return { error: msg, code: 'unknown' }
}

function isTransientTransportError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('abort') ||
    m.includes('timeout') ||
    m.includes('fetch failed') ||
    m.includes('network') ||
    m.includes('econnrefused') ||
    m.includes('etimedout') ||
    m.includes('enotfound') ||
    m.includes('socket')
  )
}

export async function createSale(input: CreateSaleInput): Promise<CreateSaleResult> {
  const { getCurrentUser } = await import('@/lib/auth/roles')
  const user = await getCurrentUser()
  if (!user) {
    return {
      error: 'Sessão expirada. Faça login novamente.',
      code: 'unauthenticated',
    }
  }

  // Timeout longo (30s): o cliente padrão aborta em 3s e o PDV achava que era offline
  const { createSyncClient } = await import('@/lib/supabase/server')
  const supabase = await createSyncClient()

  const baseArgs = {
    p_payment_method: input.payment_method,
    p_notes: input.notes || null,
    p_items: input.items as unknown as Json,
    p_client_uuid: input.client_uuid ?? null,
    p_customer_id: input.customer_id ?? null,
  }

  let data: unknown = null
  let error: { message: string } | null = null

  try {
    const first = await supabase.rpc('create_sale_with_items', {
      ...baseArgs,
      p_payments: (input.payments ?? null) as unknown as Json,
    })
    data = first.data
    error = first.error

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
      const second = await supabase.rpc('create_sale_with_items', baseArgs)
      data = second.data
      error = second.error
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    error = { message: isTransientTransportError(msg) ? 'unauthenticated' : msg }
    // "unauthenticated" aqui só força a entrada no fallback com service role
    if (isTransientTransportError(msg)) {
      error = { message: 'fetch failed: timeout' }
    }
  }

  // JWT fraco/expirada no .exe + cookie offline, ou timeout: grava online com service role
  if (error) {
    const shouldUseServiceRole =
      error.message.includes('unauthenticated') ||
      isTransientTransportError(error.message)

    if (shouldUseServiceRole) {
      const adminResult = await createSaleWithServiceRole(user.id, user.storeId, input)
      if (adminResult.saleId) {
        return finalizeCreateSale(adminResult.saleId, input)
      }
      // Sem service role no build: deixa cair pro mapa original (fila offline no PDV)
      if (adminResult.code === 'unauthenticated') {
        return mapCreateSaleError('unauthenticated')
      }
      if (adminResult.error && adminResult.code !== 'unknown') {
        return adminResult
      }
      // Transporte: PDV pode enfileirar; se admin tem outro erro, devolve ele
      if (adminResult.error && !isTransientTransportError(error.message)) {
        return adminResult
      }
    }

    return mapCreateSaleError(error.message)
  }

  if (typeof data !== 'string' || !data) {
    // Tenta service role antes de desistir (resposta vazia com JWT morto)
    const adminResult = await createSaleWithServiceRole(user.id, user.storeId, input)
    if (adminResult.saleId) return finalizeCreateSale(adminResult.saleId, input)
    return { error: 'Erro interno: resposta inesperada do servidor.', code: 'unknown' }
  }

  return finalizeCreateSale(data, input)
}

async function finalizeCreateSale(
  saleId: string,
  input: CreateSaleInput,
): Promise<CreateSaleResult> {
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

/**
 * Grava a venda direto no Supabase (service role), com seller = usuário da
 * cookie offline. Usado no .exe quando o JWT do auth.uid() já expirou.
 */
async function createSaleWithServiceRole(
  sellerId: string,
  cookieStoreId: string | null,
  input: CreateSaleInput,
): Promise<CreateSaleResult> {
  const { tryCreateServiceClient } = await import('@/lib/supabase/service')
  const admin = tryCreateServiceClient()
  if (!admin) {
    return {
      error: 'Não foi possível falar com o servidor (sem service role no app).',
      code: 'unknown',
    }
  }

  let storeId = cookieStoreId
  if (!storeId) {
    const { data: membership } = await admin
      .from('store_members')
      .select('store_id')
      .eq('user_id', sellerId)
      .limit(1)
      .maybeSingle()
    storeId = membership?.store_id ?? null
  }
  if (!storeId) {
    return {
      error: 'Sua conta não está vinculada a uma loja. Entre de novo com internet.',
      code: 'unauthenticated',
    }
  }

  if (!input.items.length) {
    return { error: 'Adicione pelo menos um produto.', code: 'empty_cart' }
  }

  // Idempotência (fila offline / retry)
  if (input.client_uuid) {
    const { data: existing } = await admin
      .from('sales')
      .select('id')
      .eq('client_uuid', input.client_uuid)
      .maybeSingle()
    if (existing?.id) return { saleId: existing.id }
  }

  // Monta linhas com preço/estoque
  type Line = {
    product_id: string
    quantity: number
    unit_price: number
    subtotal: number
    item_description: string | null
    track_stock: boolean
    name: string
  }
  const lines: Line[] = []
  let total = 0

  for (const item of input.items) {
    const { data: product, error: pErr } = await admin
      .from('products')
      .select('id, name, sale_price, stock_quantity, track_stock, is_active, store_id')
      .eq('id', item.product_id)
      .maybeSingle()

    if (pErr || !product || !product.is_active || product.store_id !== storeId) {
      return {
        error: `Produto não encontrado: ${item.product_id}`,
        code: 'product_not_found',
      }
    }

    if (product.track_stock && product.stock_quantity < item.quantity) {
      return {
        error: `Estoque insuficiente para: ${product.name}`,
        code: 'insufficient_stock',
      }
    }

    const unit =
      item.unit_price && item.unit_price > 0 ? item.unit_price : product.sale_price
    const subtotal = unit * item.quantity
    total += subtotal
    lines.push({
      product_id: product.id,
      quantity: item.quantity,
      unit_price: unit,
      subtotal,
      item_description: item.item_description ?? null,
      track_stock: product.track_stock,
      name: product.name,
    })
  }

  const paymentLines =
    input.payments && input.payments.length > 0
      ? input.payments
      : [{ method: input.payment_method === 'mixed' ? 'cash' : input.payment_method, amount: total }]

  const paySum = paymentLines.reduce((s, p) => s + p.amount, 0)
  if (Math.abs(paySum - total) > 0.009) {
    return {
      error: 'Soma das formas de pagamento deve fechar o total da venda.',
      code: 'payment_mismatch',
    }
  }

  const headerMethod: PaymentMethod =
    paymentLines.length > 1 ? 'mixed' : paymentLines[0].method

  if (
    (headerMethod === 'fiado' || paymentLines.some((p) => p.method === 'fiado')) &&
    !input.customer_id
  ) {
    return {
      error: 'Selecione um cliente para venda fiada.',
      code: 'customer_required',
    }
  }

  const { data: saleRow, error: saleErr } = await admin
    .from('sales')
    .insert({
      total_amount: total,
      payment_method: headerMethod,
      notes: input.notes || null,
      seller_id: sellerId,
      client_uuid: input.client_uuid ?? null,
      customer_id: input.customer_id ?? null,
      store_id: storeId,
    })
    .select('id')
    .single()

  if (saleErr || !saleRow) {
    // Concorrência em client_uuid
    if (input.client_uuid && saleErr?.message.toLowerCase().includes('duplicate')) {
      const { data: again } = await admin
        .from('sales')
        .select('id')
        .eq('client_uuid', input.client_uuid)
        .maybeSingle()
      if (again?.id) return { saleId: again.id }
    }
    return { error: saleErr?.message ?? 'Falha ao gravar venda', code: 'unknown' }
  }

  const saleId = saleRow.id as string

  const { data: insertedItems, error: itemsErr } = await admin
    .from('sale_items')
    .insert(
      lines.map((l) => ({
        sale_id: saleId,
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        subtotal: l.subtotal,
        item_description: l.item_description,
      })),
    )
    .select('id, sale_id, product_id, quantity, unit_price, subtotal, item_description')

  if (itemsErr) {
    await admin.from('sales').delete().eq('id', saleId)
    return { error: itemsErr.message, code: 'unknown' }
  }

  for (const l of lines) {
    if (!l.track_stock) continue
    const { data: prod } = await admin
      .from('products')
      .select('stock_quantity')
      .eq('id', l.product_id)
      .maybeSingle()
    if (!prod) continue
    await admin
      .from('products')
      .update({ stock_quantity: Math.max(0, prod.stock_quantity - l.quantity) })
      .eq('id', l.product_id)
  }

  const { error: payErr } = await admin.from('sale_payments').insert(
    paymentLines.map((p) => ({
      sale_id: saleId,
      payment_method: p.method,
      amount: p.amount,
    })),
  )
  if (payErr) {
    console.warn('[createSale] sale_payments insert:', payErr.message)
  }

  // SQLite do .exe — recibo imediato sem esperar pull
  if (isElectron()) {
    try {
      const { writeLocalSaleSnapshot } = await import('@/lib/db/sync')
      writeLocalSaleSnapshot(
        {
          id: saleId,
          total_amount: total,
          payment_method: headerMethod,
          notes: input.notes || null,
          seller_id: sellerId,
          client_uuid: input.client_uuid ?? null,
          customer_id: input.customer_id ?? null,
          store_id: storeId,
          created_at: new Date().toISOString(),
        },
        (insertedItems ?? lines.map((l) => ({
          sale_id: saleId,
          product_id: l.product_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          subtotal: l.subtotal,
          item_description: l.item_description,
        }))).map((row) => ({
          id: 'id' in row && row.id ? String(row.id) : undefined,
          sale_id: saleId,
          product_id: row.product_id,
          quantity: row.quantity,
          unit_price: row.unit_price,
          subtotal: row.subtotal,
          item_description: row.item_description ?? null,
        })),
      )
    } catch (err) {
      console.warn('[createSale] local snapshot failed:', err)
    }
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
    // JWT offline/expired: cancel via service role after app-level isAdmin check
    const { tryCreateServiceClient } = await import('@/lib/supabase/service')
    const service = tryCreateServiceClient()
    if (!service) {
      if (error.message.includes('forbidden')) {
        return {
          success: false,
          error: 'Sessão expirada. Entre de novo ou configure a service role.',
        }
      }
      if (error.message.includes('sale_not_found')) {
        return { success: false, error: 'Venda não encontrada.' }
      }
      return { success: false, error: error.message }
    }

    const { data: items, error: itemsErr } = await service
      .from('sale_items')
      .select('product_id, quantity, products(track_stock)')
      .eq('sale_id', saleId)

    if (itemsErr) return { success: false, error: itemsErr.message }

    for (const item of items ?? []) {
      const track =
        (item.products as { track_stock?: boolean } | null)?.track_stock ?? true
      if (!track) continue
      const { data: prod } = await service
        .from('products')
        .select('stock_quantity')
        .eq('id', item.product_id)
        .maybeSingle()
      if (!prod) continue
      await service
        .from('products')
        .update({ stock_quantity: prod.stock_quantity + item.quantity })
        .eq('id', item.product_id)
    }

    const { error: delErr } = await service.from('sales').delete().eq('id', saleId)
    if (delErr) {
      if (delErr.message.toLowerCase().includes('0 rows')) {
        return { success: false, error: 'Venda não encontrada.' }
      }
      return { success: false, error: delErr.message }
    }
  }

  if (isElectron()) {
    await deleteLocalSale(saleId).catch((err) => {
      console.warn('[electron] deleteLocalSale failed, will sync on next cycle:', err)
    })
  }

  revalidatePath('/vendas')
  revalidatePath(`/vendas/${saleId}`)
  revalidatePath('/dashboard')
  revalidatePath('/produtos')
  revalidatePath('/clientes')

  return { success: true }
}
