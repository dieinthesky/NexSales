import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getAdminDataClient } from '@/lib/supabase/admin-data'
import { isPixConfigured } from '@/lib/utils/pix-brcode'
import type { StorePixConfig } from '@/components/sales/pix-qr-panel'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/** Produto “fantasma” (inativo) guarda o PIX da loja — funciona sem migration SQL. */
export const PIX_PRODUCT_CODE = '__PIX_LOJA__'

export type StorePixForm = {
  pix_key: string
  pix_merchant_name: string
  pix_merchant_city: string
}

type Client = SupabaseClient<Database>

type PixDesc = { key: string; city?: string }

function encodeDesc(key: string, city: string): string {
  return JSON.stringify({ key, city } satisfies PixDesc)
}

function decodeDesc(raw: string | null | undefined): PixDesc | null {
  if (!raw?.trim()) return null
  try {
    const j = JSON.parse(raw) as PixDesc
    if (j && typeof j.key === 'string') return j
  } catch {
    // legado: texto puro = só a chave
    return { key: raw.trim() }
  }
  return null
}

async function clients(): Promise<Client[]> {
  const user = await createClient()
  const list: Client[] = [user]
  try {
    const admin = await getAdminDataClient()
    if (admin !== user) list.push(admin)
  } catch {
    // ignore
  }
  return list
}

/** Salva PIX: tenta coluna em stores; se não existir, grava no produto técnico. */
export async function persistStorePix(
  storeId: string,
  form: StorePixForm,
  storeNameFallback: string,
): Promise<{ error?: string }> {
  const payload = {
    pix_key: form.pix_key.trim() || null,
    pix_merchant_name: form.pix_merchant_name.trim() || null,
    pix_merchant_city: form.pix_merchant_city.trim() || null,
  }

  for (const client of await clients()) {
    const { error } = await client.from('stores').update(payload).eq('id', storeId)
    if (!error) return {}
    // coluna inexistente / permissão — tenta o próximo / fallback
    if (!error.message.includes('column') && !error.message.includes('pix_key')) {
      // ainda tenta fallback se for schema;
    }
  }

  // Fallback sem SQL: produto inativo oculto na lista (is_active = false)
  const name = form.pix_merchant_name.trim() || storeNameFallback || 'PIX'
  const description = encodeDesc(form.pix_key.trim(), form.pix_merchant_city.trim())

  for (const client of await clients()) {
    const { data: existing } = await client
      .from('products')
      .select('id')
      .eq('store_id', storeId)
      .eq('code', PIX_PRODUCT_CODE)
      .maybeSingle()

    if (existing?.id) {
      const { error } = await client
        .from('products')
        .update({
          name,
          description,
          is_active: false,
          track_stock: false,
          sale_price: 0,
          cost_price: 0,
        })
        .eq('id', existing.id)
      if (!error) return {}
    } else {
      const { error } = await client.from('products').insert({
        code: PIX_PRODUCT_CODE,
        name,
        description,
        sale_price: 0,
        cost_price: 0,
        stock_quantity: 0,
        min_stock: 0,
        is_active: false,
        track_stock: false,
        store_id: storeId,
        category_id: null,
      })
      if (!error) return {}
      if (error.code === '23505') {
        // race: update
        const { error: upErr } = await client
          .from('products')
          .update({
            name,
            description,
            is_active: false,
            track_stock: false,
          })
          .eq('store_id', storeId)
          .eq('code', PIX_PRODUCT_CODE)
        if (!upErr) return {}
      }
    }
  }

  return {
    error:
      'Não foi possível salvar o PIX. Confira se você é admin da loja e tente de novo.',
  }
}

export async function loadStorePixRecord(
  storeId: string,
): Promise<{ storeName: string; form: StorePixForm } | null> {
  let storeName = 'Sua loja'

  for (const client of await clients()) {
    // 1) Colunas na tabela stores (quando SQL já rodou)
    const { data: store, error } = await client
      .from('stores')
      .select('name, pix_key, pix_merchant_name, pix_merchant_city')
      .eq('id', storeId)
      .maybeSingle()

    if (!error && store) {
      const row = store as {
        name?: string
        pix_key?: string | null
        pix_merchant_name?: string | null
        pix_merchant_city?: string | null
      }
      storeName = row.name || storeName
      if (row.pix_key) {
        return {
          storeName,
          form: {
            pix_key: row.pix_key ?? '',
            pix_merchant_name: row.pix_merchant_name ?? storeName,
            pix_merchant_city: row.pix_merchant_city ?? '',
          },
        }
      }
    }

    // 2) Fallback produto fantasma
    const { data: pixProd } = await client
      .from('products')
      .select('name, description')
      .eq('store_id', storeId)
      .eq('code', PIX_PRODUCT_CODE)
      .maybeSingle()

    if (pixProd) {
      const desc = decodeDesc(pixProd.description)
      if (desc?.key) {
        return {
          storeName,
          form: {
            pix_key: desc.key,
            pix_merchant_name: pixProd.name || storeName,
            pix_merchant_city: desc.city ?? '',
          },
        }
      }
    }

    // ao menos o nome da loja
    if (!error && store && (store as { name?: string }).name) {
      storeName = (store as { name: string }).name
    }
  }

  return {
    storeName,
    form: {
      pix_key: '',
      pix_merchant_name: storeName,
      pix_merchant_city: '',
    },
  }
}

export async function loadPixConfigForStore(
  storeId: string,
): Promise<StorePixConfig | null> {
  const rec = await loadStorePixRecord(storeId)
  if (!rec || !isPixConfigured(rec.form.pix_key)) return null
  return {
    key: rec.form.pix_key.trim(),
    merchantName: rec.form.pix_merchant_name.trim() || rec.storeName,
    merchantCity: rec.form.pix_merchant_city.trim() || undefined,
  }
}
