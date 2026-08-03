import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getAdminDataClient } from '@/lib/supabase/admin-data'
import {
  SUBSCRIPTION_PRODUCT_CODE,
  type SubscriptionRecord,
  computeSubscription,
  type SubscriptionView,
} from '@/lib/config/plans'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

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

function decodeSub(description: string | null | undefined): SubscriptionRecord | null {
  if (!description?.trim()) return null
  try {
    const j = JSON.parse(description) as SubscriptionRecord
    if (j?.startedAt) return j
  } catch {
    // startedAt plain date
    if (/^\d{4}-\d{2}-\d{2}/.test(description.trim())) {
      return { startedAt: description.trim().slice(0, 10), plan: 'monthly' }
    }
  }
  return null
}

export async function loadStoreSubscription(
  storeId: string,
): Promise<{ record: SubscriptionRecord | null; view: SubscriptionView }> {
  for (const client of await clients()) {
    const { data } = await client
      .from('products')
      .select('description')
      .eq('store_id', storeId)
      .eq('code', SUBSCRIPTION_PRODUCT_CODE)
      .maybeSingle()

    if (data) {
      const record = decodeSub(data.description)
      return { record, view: computeSubscription(record) }
    }
  }
  return { record: null, view: computeSubscription(null) }
}

export async function saveStoreSubscription(
  storeId: string,
  record: SubscriptionRecord,
): Promise<{ error?: string }> {
  const description = JSON.stringify(record)
  const name = 'Assinatura CaixaDoBairro'

  for (const client of await clients()) {
    const { data: existing } = await client
      .from('products')
      .select('id')
      .eq('store_id', storeId)
      .eq('code', SUBSCRIPTION_PRODUCT_CODE)
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
        code: SUBSCRIPTION_PRODUCT_CODE,
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
        const { error: up } = await client
          .from('products')
          .update({ description, is_active: false, track_stock: false })
          .eq('store_id', storeId)
          .eq('code', SUBSCRIPTION_PRODUCT_CODE)
        if (!up) return {}
      }
    }
  }

  return { error: 'Não foi possível salvar a assinatura da loja.' }
}
