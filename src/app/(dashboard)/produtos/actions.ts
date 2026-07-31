'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { productSchema } from '@/lib/validations/product.schema'
import { lookupExternalBarcode, type BarcodeSource } from '@/lib/barcode/lookup'
import { isAdmin } from '@/lib/auth/roles'

export type BarcodeLookupResult =
  | {
      status: 'already_registered'
      productId: string
      name: string
      /** Soft-deleted product — código ainda ocupado; reativar em vez de criar de novo. */
      inactive?: boolean
    }
  | {
      status: 'found_external'
      source: BarcodeSource
      name: string
      description: string | null
    }
  | { status: 'not_found' }
  | { status: 'error'; message: string }

/**
 * Look up a barcode for the product cadastro flow.
 *
 * Resolution order (each step short-circuits on hit):
 *   1. Products table — if the user already registered this code → 'already_registered'
 *   2. barcode_cache table — if we've looked this code up before, reuse the result
 *   3. Cosmos → Open Food Facts → UPCitemdb — external lookup
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
      .select('id, name, is_active')
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
      return {
        status: 'found_external',
        source: cached.source,
        name: cached.name,
        description: cached.description,
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

export async function createProduct(formData: FormData) {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem cadastrar produtos.' }
  }

  const raw = Object.fromEntries(formData)
  const parsed = productSchema.safeParse(raw)

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('products').insert({
    ...parsed.data,
    category_id: parsed.data.category_id || null,
    description: parsed.data.description || null,
  })

  if (error) {
    if (error.code === '23505') return { error: 'Código de produto já existe.' }
    return { error: error.message }
  }

  revalidatePath('/produtos')
  redirect('/produtos')
}

export async function updateProduct(id: string, formData: FormData) {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem editar produtos.' }
  }

  const raw = Object.fromEntries(formData)
  const parsed = productSchema.safeParse(raw)

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({
      ...parsed.data,
      category_id: parsed.data.category_id || null,
      description: parsed.data.description || null,
    })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') return { error: 'Código de produto já existe.' }
    return { error: error.message }
  }

  revalidatePath('/produtos')
  redirect('/produtos')
}

export async function deleteProduct(id: string) {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem excluir produtos.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/produtos')
  return { success: true }
}

export async function reactivateProduct(id: string) {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem reativar produtos.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ is_active: true })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/produtos')
  revalidatePath(`/produtos/${id}`)
  return { success: true }
}
