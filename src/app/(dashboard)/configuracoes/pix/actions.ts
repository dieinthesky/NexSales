'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin, getCurrentUser } from '@/lib/auth/roles'
import {
  loadStorePixRecord,
  persistStorePix,
  type StorePixForm,
} from '@/lib/store-pix'

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

  const storeId = user.storeId
  if (!storeId) {
    return { error: 'Sua conta precisa estar vinculada a uma loja.' }
  }

  const current = await loadStorePixRecord(storeId)
  const result = await persistStorePix(
    storeId,
    {
      pix_key: parsed.data.pix_key,
      pix_merchant_name: parsed.data.pix_merchant_name,
      pix_merchant_city: parsed.data.pix_merchant_city,
    },
    current?.storeName || 'CAIXA DO BAIRRO',
  )

  if (result.error) return { error: result.error }

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

  const rec = await loadStorePixRecord(user.storeId)
  return {
    storeId: user.storeId,
    storeName: rec?.storeName ?? 'Sua loja',
    form: rec?.form ?? {
      pix_key: '',
      pix_merchant_name: '',
      pix_merchant_city: '',
    },
  }
}
