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
        imageUrl: null,
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
  supabase: Awaited<ReturnType<typeof createClient>>,
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

  const supabase = await createClient()
  const externalUrl = String(imageUrlField ?? '').trim() || null

  const { data: created, error } = await supabase
    .from('products')
    .insert({
      ...parsed.data,
      category_id: parsed.data.category_id || null,
      description: parsed.data.description || null,
      image_url: externalUrl,
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

  revalidatePath('/produtos')
  redirect('/produtos')
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

  const supabase = await createClient()
  const { data: current } = await supabase
    .from('products')
    .select('image_url')
    .eq('id', id)
    .maybeSingle()

  const fd = new FormData()
  if (imageFile instanceof File) fd.set('image', imageFile)
  if (imageUrlField) fd.set('image_url', String(imageUrlField))
  if (removeImage) fd.set('remove_image', String(removeImage))

  const resolved = await resolveProductImageUrl(
    supabase,
    id,
    fd,
    current?.image_url ?? null,
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
  revalidatePath('/vendas/nova')
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
