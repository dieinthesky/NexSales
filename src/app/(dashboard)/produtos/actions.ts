'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { productSchema } from '@/lib/validations/product.schema'
import {
  lookupExternalBarcode,
  lookupExternalProductImage,
  type BarcodeSource,
} from '@/lib/barcode/lookup'
import { getCurrentUser, isAdmin } from '@/lib/auth/roles'
import {
  canAccessStoreRow,
  getAdminDataClient,
  resolveAdminContext,
} from '@/lib/supabase/admin-data'
import { tryCreateServiceClient } from '@/lib/supabase/service'
import { getDb, isElectron } from '@/lib/db/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type BarcodeLookupResult =
  | {
      status: 'already_registered'
      productId: string
      name: string
      /** Soft-deleted product — código ainda ocupado; reativar em vez de criar de novo. */
      inactive?: boolean
      stock_quantity?: number
      sale_price?: number
    }
  | {
      status: 'found_external'
      source: BarcodeSource
      name: string
      description: string | null
      imageUrl?: string | null
    }
  | { status: 'not_found' }
  | { status: 'error'; message: string }

/**
 * Look up a barcode for the product cadastro flow.
 *
 * Resolution order (each step short-circuits on hit):
 *   1. Products table — if the user already registered this code → 'already_registered'
 *   2. barcode_cache table — if we've looked this code up before, reuse the result
 *   3. Cosmos → Open Food/Products/Beauty Facts → UPCitemdb — external lookup
 *   4. Persist whatever was found (including 'not_found') in barcode_cache so
 *      the same code never hits external APIs again.
 */
export async function lookupProductByBarcode(
  code: string,
): Promise<BarcodeLookupResult> {
  const trimmed = code.trim()
  if (!trimmed) return { status: 'not_found' }

  try {
    const supabase = await createClient()

    // 1. Already cadastrated by the user? (inclui inativos — code é UNIQUE)
    const { data: existing, error: existingError } = await supabase
      .from('products')
      .select('id, name, is_active, stock_quantity, sale_price')
      .eq('code', trimmed)
      .maybeSingle()

    if (existingError) {
      return { status: 'error', message: 'Erro ao consultar produtos.' }
    }

    if (existing) {
      return {
        status: 'already_registered',
        productId: existing.id,
        name: existing.name,
        inactive: existing.is_active === false,
        stock_quantity: existing.stock_quantity,
        sale_price: existing.sale_price,
      }
    }

    // 2. Previously looked up? Reuse the cached result, no API spend.
    const { data: cached } = await supabase
      .from('barcode_cache')
      .select('source, name, description')
      .eq('code', trimmed)
      .maybeSingle()

    if (cached) {
      // Reset TTL so frequently-used barcodes are never evicted by the cleanup job.
      void supabase
        .from('barcode_cache')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('code', trimmed)

      if (cached.source === 'not_found' || !cached.name) {
        return { status: 'not_found' }
      }

      // Cache antigo não guarda foto — busca imagem no OFF sem invalidar o nome.
      const imageUrl = await lookupExternalProductImage(trimmed)

      return {
        status: 'found_external',
        source: cached.source,
        name: cached.name,
        description: cached.description,
        imageUrl,
      }
    }

    // 3. Hit external APIs in order
    const external = await lookupExternalBarcode(trimmed)

    // 4. Persist the result so future lookups of this same code are free.
    //    We deliberately ignore upsert errors — they shouldn't block the user.
    if (external) {
      await supabase.from('barcode_cache').upsert(
        {
          code: trimmed,
          source: external.source,
          name: external.name,
          description: external.description,
        },
        { onConflict: 'code' },
      )

      return {
        status: 'found_external',
        source: external.source,
        name: external.name,
        description: external.description,
        imageUrl: external.imageUrl ?? null,
      }
    }

    await supabase.from('barcode_cache').upsert(
      { code: trimmed, source: 'not_found', name: null, description: null },
      { onConflict: 'code' },
    )

    return { status: 'not_found' }
  } catch {
    return { status: 'error', message: 'Falha ao consultar base de produtos.' }
  }
}

async function resolveProductImageUrl(
  supabase: Awaited<ReturnType<typeof getAdminDataClient>>,
  productId: string,
  formData: FormData,
  currentUrl: string | null,
): Promise<{ url: string | null; error?: string }> {
  const file = formData.get('image')
  const removeImage = formData.get('remove_image') === '1'
  const externalUrl = String(formData.get('image_url') ?? '').trim() || null

  if (file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) {
      return { url: currentUrl, error: 'A foto deve ter no máximo 5 MB.' }
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) {
      return { url: currentUrl, error: 'Use uma imagem JPG, PNG ou WEBP.' }
    }

    const ext =
      file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
          ? 'webp'
          : file.type === 'image/gif'
            ? 'gif'
            : 'jpg'
    const path = `${productId}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('product-photos')
      .upload(path, file, { contentType: file.type, upsert: true })

    if (uploadError) {
      return {
        url: currentUrl,
        error:
          'Não foi possível enviar a foto. Rode o SQL de product-photos no Supabase e tente de novo.',
      }
    }

    const { data } = supabase.storage.from('product-photos').getPublicUrl(path)
    return { url: data.publicUrl }
  }

  if (removeImage) return { url: null }
  if (externalUrl) return { url: externalUrl }
  return { url: currentUrl }
}

/**
 * Busca foto externa (Open Food Facts etc.) pelo código e grava em products.image_url.
 * Usado para produtos já cadastrados sem foto.
 */
export async function fetchProductImage(productId: string): Promise<{
  imageUrl?: string | null
  error?: string
}> {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem atualizar foto.' }
  }

  const supabase = await getAdminDataClient()
  const { data: product, error } = await supabase
    .from('products')
    .select('id, code, image_url')
    .eq('id', productId)
    .maybeSingle()

  if (error || !product) return { error: 'Produto não encontrado.' }
  if (product.image_url) return { imageUrl: product.image_url }

  const imageUrl = await lookupExternalProductImage(product.code)
  if (!imageUrl) {
    return { error: 'Nenhuma foto encontrada para este código.' }
  }

  const { error: updateError } = await supabase
    .from('products')
    .update({ image_url: imageUrl })
    .eq('id', productId)

  if (updateError) {
    return {
      error:
        'Não foi possível salvar a foto. Rode o SQL de product-images no Supabase.',
    }
  }

  revalidatePath('/produtos')
  revalidatePath(`/produtos/${productId}`)
  revalidatePath('/vendas/nova')
  return { imageUrl }
}

/**
 * PDV: qualquer usuário autenticado. Retorna foto do OFF e tenta gravar no produto
 * (best-effort — se a coluna image_url ainda não existir, só devolve a URL).
 */
export async function resolveProductImageForPdv(
  productId: string,
  code: string,
): Promise<{ imageUrl: string | null }> {
  const trimmed = code.trim()
  if (!productId || !/^\d{8,14}$/.test(trimmed)) {
    return { imageUrl: null }
  }

  try {
    const supabase = await createClient()
    const { data: product, error: selectError } = await supabase
      .from('products')
      .select('image_url')
      .eq('id', productId)
      .maybeSingle()

    // Se a coluna image_url ainda não existe, selectError vem preenchido —
    // seguimos mesmo assim e só devolvemos a URL do OFF para o PDV mostrar.
    if (!selectError && product?.image_url) {
      return { imageUrl: product.image_url }
    }

    const imageUrl = await lookupExternalProductImage(trimmed)
    if (!imageUrl) return { imageUrl: null }

    if (!selectError) {
      await supabase
        .from('products')
        .update({ image_url: imageUrl })
        .eq('id', productId)
        .is('image_url', null)
    }

    return { imageUrl }
  } catch {
    // Último recurso: tenta OFF mesmo se Supabase falhar
    try {
      return { imageUrl: await lookupExternalProductImage(trimmed) }
    } catch {
      return { imageUrl: null }
    }
  }
}

export async function createProduct(formData: FormData) {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem cadastrar produtos.' }
  }

  const imageFile = formData.get('image')
  const imageUrlField = formData.get('image_url')
  const removeImage = formData.get('remove_image')
  formData.delete('image')
  formData.delete('image_url')
  formData.delete('remove_image')

  const raw = Object.fromEntries(formData)
  const parsed = productSchema.safeParse(raw)

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const ctx = await resolveAdminContext()
  const storeId = ctx.storeId
  if (!storeId) {
    return { error: 'Sua conta não está vinculada a uma loja.' }
  }

  const supabase = await getAdminDataClient()
  const externalUrl = String(imageUrlField ?? '').trim() || null

  const { data: created, error } = await supabase
    .from('products')
    .insert({
      ...parsed.data,
      category_id: parsed.data.category_id || null,
      description: parsed.data.description || null,
      image_url: externalUrl,
      store_id: storeId,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Código de produto já existe.' }
    return { error: error.message }
  }

  if (imageFile instanceof File && imageFile.size > 0 && created?.id) {
    const fd = new FormData()
    fd.set('image', imageFile)
    if (removeImage) fd.set('remove_image', String(removeImage))
    const resolved = await resolveProductImageUrl(supabase, created.id, fd, externalUrl)
    if (resolved.error) return { error: resolved.error }
    if (resolved.url !== externalUrl) {
      await supabase.from('products').update({ image_url: resolved.url }).eq('id', created.id)
    }
  }

  // Desktop: grava no SQLite na hora (lista não espera o sync de ~60s)
  if (isElectron() && created?.id) {
    try {
      const now = new Date().toISOString()
      const d = parsed.data
      getDb()
        .prepare(
          `INSERT OR REPLACE INTO products
           (id, code, name, description, sale_price, cost_price, stock_quantity, min_stock,
            category_id, is_active, track_stock, image_url, store_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
        )
        .run(
          created.id,
          d.code,
          d.name,
          d.description ?? null,
          d.sale_price,
          d.cost_price ?? 0,
          d.stock_quantity ?? 0,
          d.min_stock ?? 0,
          d.category_id || null,
          d.track_stock === false ? 0 : 1,
          externalUrl,
          storeId,
          now,
          now,
        )
    } catch {
      // best-effort
    }
  }

  revalidatePath('/produtos', 'layout')
  revalidatePath('/vendas/nova', 'layout')
  // Cache-buster: força o servidor a re-renderizar a lista
  redirect(`/produtos?novo=${created?.id ?? '1'}`)
}

export async function updateProduct(id: string, formData: FormData) {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem editar produtos.' }
  }

  const imageFile = formData.get('image')
  const imageUrlField = formData.get('image_url')
  const removeImage = formData.get('remove_image')
  formData.delete('image')
  formData.delete('image_url')
  formData.delete('remove_image')

  const raw = Object.fromEntries(formData)
  const parsed = productSchema.safeParse(raw)

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { role, storeId, storeIds } = await resolveAdminContext()
  const supabase = await getAdminDataClient()
  const { data: existing } = await supabase
    .from('products')
    .select('id, store_id, image_url')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return { error: 'Produto não encontrado.' }
  if (!canAccessStoreRow(role, storeId, existing.store_id, storeIds)) {
    return { error: 'Sem permissão para editar este produto.' }
  }

  const fd = new FormData()
  if (imageFile instanceof File) fd.set('image', imageFile)
  if (imageUrlField) fd.set('image_url', String(imageUrlField))
  if (removeImage) fd.set('remove_image', String(removeImage))

  const resolved = await resolveProductImageUrl(
    supabase,
    id,
    fd,
    existing.image_url ?? null,
  )
  if (resolved.error) return { error: resolved.error }

  const { error } = await supabase
    .from('products')
    .update({
      ...parsed.data,
      category_id: parsed.data.category_id || null,
      description: parsed.data.description || null,
      image_url: resolved.url,
    })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') return { error: 'Código de produto já existe.' }
    return { error: error.message }
  }

  revalidatePath('/produtos')
  revalidatePath(`/produtos/${id}`)
  revalidatePath('/vendas/nova')
  redirect('/produtos')
}

type ProductTarget = { id: string; store_id: string | null }

/** Localiza produto: sessão (RLS) → service role → SQLite (desktop). */
async function resolveProductForMutation(
  id: string,
): Promise<{
  product: ProductTarget
  writeClient: SupabaseClient<Database> | null
  localOnly: boolean
} | null> {
  const trimmed = id?.trim()
  if (!trimmed) return null

  const userClient = await createClient()
  const { data: rls } = await userClient
    .from('products')
    .select('id, store_id')
    .eq('id', trimmed)
    .maybeSingle()
  if (rls) {
    return {
      product: rls as ProductTarget,
      writeClient: userClient,
      localOnly: false,
    }
  }

  const service = tryCreateServiceClient()
  if (service) {
    const { data: row } = await service
      .from('products')
      .select('id, store_id')
      .eq('id', trimmed)
      .maybeSingle()
    if (row) {
      return {
        product: row as ProductTarget,
        writeClient: service,
        localOnly: false,
      }
    }
  }

  // Desktop: lista vem do SQLite; sessão offline às vezes não enxerga o Supabase.
  // Chegamos aqui só se RLS e service role não acharam o id na nuvem.
  if (isElectron()) {
    try {
      const row = getDb()
        .prepare(`SELECT id, store_id FROM products WHERE id = ?`)
        .get(trimmed) as ProductTarget | undefined
      if (row?.id) {
        return {
          product: {
            id: String(row.id),
            store_id: row.store_id ? String(row.store_id) : null,
          },
          writeClient: service ?? userClient,
          localOnly: true,
        }
      }
    } catch {
      // ignore sqlite errors
    }
  }

  return null
}

function applyLocalProductRemoval(id: string, hard: boolean): void {
  if (!isElectron()) return
  try {
    const db = getDb()
    if (hard) {
      db.prepare(`DELETE FROM products WHERE id = ?`).run(id)
    } else {
      db.prepare(
        `UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?`,
      ).run(id)
    }
  } catch {
    // best-effort
  }
}

export async function deleteProduct(id: string) {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem excluir produtos.' }
  }

  const { role, storeId, storeIds } = await resolveAdminContext()
  const resolved = await resolveProductForMutation(id)

  if (!resolved) {
    return {
      error:
        'Produto não encontrado no servidor. Atualize a página (F5) e tente de novo. No app de PC: confira a conexão e o login.',
    }
  }

  const { product, writeClient, localOnly } = resolved
  if (!canAccessStoreRow(role, storeId, product.store_id, storeIds)) {
    return { error: 'Sem permissão para excluir este produto.' }
  }

  // Só no cache local (sem achar no Supabase) — remove e some da lista do desktop
  if (localOnly || !writeClient) {
    applyLocalProductRemoval(product.id, true)
    revalidatePath('/produtos')
    revalidatePath('/vendas/nova')
    return {
      success: true as const,
      deleted: true as const,
      message: 'Produto removido.',
    }
  }

  // Mesmo com find via RLS: se o update/delete for bloqueado, tenta service role
  const clients: SupabaseClient<Database>[] = [writeClient]
  const service = tryCreateServiceClient()
  if (service && service !== writeClient) clients.push(service)

  async function withClients<T>(
    fn: (c: SupabaseClient<Database>) => Promise<{ data: T; error: { message: string } | null }>,
  ): Promise<{ data: T | null; error: string | null }> {
    let lastError: string | null = null
    for (const c of clients) {
      const { data, error } = await fn(c)
      if (!error) return { data, error: null }
      lastError = error.message
    }
    return { data: null, error: lastError }
  }

  let salesCount = 0
  for (const c of clients) {
    const { count, error } = await c
      .from('sale_items')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', product.id)
    if (!error) {
      salesCount = count ?? 0
      break
    }
  }

  if (salesCount > 0) {
    const { error } = await withClients(async (c) => {
      const res = await c.from('products').update({ is_active: false }).eq('id', product.id)
      return { data: null, error: res.error }
    })
    if (error) return { error }
    applyLocalProductRemoval(product.id, false)
    revalidatePath('/produtos')
    revalidatePath('/vendas/nova')
    return {
      success: true as const,
      deactivated: true as const,
      message: 'Produto já foi vendido — foi desativado (histórico preservado).',
    }
  }

  const { error: delError } = await withClients(async (c) => {
    const res = await c.from('products').delete().eq('id', product.id)
    return { data: null, error: res.error }
  })

  if (delError) {
    const { error: softError } = await withClients(async (c) => {
      const res = await c.from('products').update({ is_active: false }).eq('id', product.id)
      return { data: null, error: res.error }
    })
    if (softError) return { error: softError }
    applyLocalProductRemoval(product.id, false)
    revalidatePath('/produtos')
    revalidatePath('/vendas/nova')
    return {
      success: true as const,
      deactivated: true as const,
      message: 'Não foi possível apagar — produto desativado.',
    }
  }

  applyLocalProductRemoval(product.id, true)
  revalidatePath('/produtos')
  revalidatePath('/vendas/nova')
  return { success: true as const, deleted: true as const }
}

export async function reactivateProduct(id: string) {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem reativar produtos.' }
  }

  const { role, storeId, storeIds } = await resolveAdminContext()
  const supabase = await getAdminDataClient()
  const { data: existing } = await supabase
    .from('products')
    .select('id, store_id')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return { error: 'Produto não encontrado.' }
  if (!canAccessStoreRow(role, storeId, existing.store_id, storeIds)) {
    return { error: 'Sem permissão para reativar este produto.' }
  }

  const { error } = await supabase
    .from('products')
    .update({ is_active: true })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/produtos')
  revalidatePath(`/produtos/${id}`)
  return { success: true }
}

export type VisitProductResult = {
  id: string
  code: string
  name: string
  stock_quantity: number
  sale_price: number
}

/** Atualiza só o estoque (fluxo Visita / Inventário no celular). */
export async function setProductStock(
  productId: string,
  quantity: number,
): Promise<{ error: string } | { success: true; product: VisitProductResult }> {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem alterar estoque.' }
  }

  const qty = Number(quantity)
  if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 0) {
    return { error: 'Estoque inválido.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .update({
      stock_quantity: qty,
      is_active: true,
      track_stock: true,
    })
    .eq('id', productId)
    .select('id, code, name, stock_quantity, sale_price')
    .single()

  if (error) return { error: error.message }
  if (!data) return { error: 'Produto não encontrado.' }

  revalidatePath('/produtos')
  revalidatePath('/produtos/visita')
  revalidatePath('/vendas/nova')
  return { success: true, product: data }
}

/** Cadastro rápido na visita: código + nome + preço + estoque (sem redirect). */
export async function createProductFromVisit(input: {
  code: string
  name: string
  sale_price: number
  stock_quantity: number
  cost_price?: number
  description?: string | null
  category_id?: string | null
  image_url?: string | null
}): Promise<{ error: string } | { success: true; product: VisitProductResult }> {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem cadastrar produtos.' }
  }

  const parsed = productSchema.safeParse({
    code: input.code.trim(),
    name: input.name.trim(),
    description: input.description ?? '',
    sale_price: input.sale_price,
    cost_price: input.cost_price ?? 0,
    stock_quantity: input.stock_quantity,
    min_stock: 0,
    category_id: input.category_id || '',
    track_stock: true,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const user = await getCurrentUser()
  if (!user?.storeId) {
    return { error: 'Sua conta não está vinculada a uma loja.' }
  }

  const supabase = await createClient()
  const imageUrl = input.image_url?.trim() || null

  const { data, error } = await supabase
    .from('products')
    .insert({
      ...parsed.data,
      category_id: parsed.data.category_id || null,
      description: parsed.data.description || null,
      image_url: imageUrl,
      store_id: user.storeId,
    })
    .select('id, code, name, stock_quantity, sale_price')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Código de produto já existe.' }
    return { error: error.message }
  }
  if (!data) return { error: 'Falha ao criar produto.' }

  revalidatePath('/produtos')
  revalidatePath('/produtos/visita')
  revalidatePath('/vendas/nova')
  return { success: true, product: data }
}
