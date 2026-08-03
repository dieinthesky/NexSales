'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, getCurrentUser } from '@/lib/auth/roles'
import { getAdminDataClient } from '@/lib/supabase/admin-data'

export type StorePixForm = {
  pix_key: string
  pix_merchant_name: string
  pix_merchant_city: string
}

const schema = z.object({
  pix_key: z.string().trim().max(120),
  pix_merchant_name: z.string().trim().max(40),
  pix_merchant_city: z.string().trim().max(30),
})

export async function saveStorePixSettings(
  form: StorePixForm,
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireAdmin()
  if (!user.storeId && user.role !== 'master') {
    return { error: 'Sua conta não está vinculada a uma loja.' }
  }

  const parsed = schema.safeParse(form)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const storeId =
    user.role === 'master' && user.storeId
      ? user.storeId
      : user.storeId

  if (!storeId) {
    return { error: 'Selecione/associe uma loja para cadastrar o PIX.' }
  }

  const payload = {
    pix_key: parsed.data.pix_key || null,
    pix_merchant_name: parsed.data.pix_merchant_name || null,
    pix_merchant_city: parsed.data.pix_merchant_city || null,
  }

  const supabase = await createClient()
  let { error } = await supabase.from('stores').update(payload).eq('id', storeId)

  if (error) {
    try {
      const admin = await getAdminDataClient()
      const retry = await admin.from('stores').update(payload).eq('id', storeId)
      error = retry.error
    } catch {
      // keep original error
    }
  }

  if (error) {
    if (error.message.includes('pix_key') || error.message.includes('column')) {
      return {
        error:
          'Colunas PIX ainda não existem no banco. Rode o SQL RODAR-STORE-PIX.sql no Supabase.',
      }
    }
    return { error: error.message }
  }

  revalidatePath('/configuracoes/pix')
  revalidatePath('/vendas/nova')
  return { success: true }
}

export async function loadStorePixForCurrentUser(): Promise<{
  storeId: string | null
  storeName: string
  form: StorePixForm
} | null> {
  const user = await getCurrentUser()
  if (!user?.storeId) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('stores')
    .select('id, name, pix_key, pix_merchant_name, pix_merchant_city')
    .eq('id', user.storeId)
    .maybeSingle()

  if (!data) {
    return {
      storeId: user.storeId,
      storeName: 'Sua loja',
      form: { pix_key: '', pix_merchant_name: '', pix_merchant_city: '' },
    }
  }

  const row = data as {
    id: string
    name: string
    pix_key?: string | null
    pix_merchant_name?: string | null
    pix_merchant_city?: string | null
  }

  return {
    storeId: row.id,
    storeName: row.name,
    form: {
      pix_key: row.pix_key ?? '',
      pix_merchant_name: row.pix_merchant_name ?? row.name ?? '',
      pix_merchant_city: row.pix_merchant_city ?? '',
    },
  }
}
