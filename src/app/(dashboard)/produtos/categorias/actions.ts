'use server'

import { revalidatePath } from 'next/cache'
import { categorySchema } from '@/lib/validations/category.schema'
import { requireAdmin } from '@/lib/auth/roles'
import { getAdminDataClient, resolveAdminContext } from '@/lib/supabase/admin-data'
import type { Category } from '@/types/database'

export async function createCategory(name: string) {
  const user = await requireAdmin()
  const parsed = categorySchema.safeParse({ name })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { storeId } = await resolveAdminContext(user)
  if (!storeId) {
    return { error: 'Sua conta não está vinculada a uma loja.' }
  }

  const client = await getAdminDataClient()
  const { data, error } = await client
    .from('categories')
    .insert({ name: parsed.data.name.trim(), store_id: storeId })
    .select('id, name, store_id, created_at')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Categoria já existe nesta loja.' }
    return { error: error.message }
  }

  revalidatePath('/produtos/categorias')
  revalidatePath('/produtos')
  revalidatePath('/produtos/novo')
  revalidatePath('/produtos', 'layout')
  return { success: true, category: data as Category }
}

export async function deleteCategory(id: string) {
  const user = await requireAdmin()
  const { storeId, role } = await resolveAdminContext(user)
  const client = await getAdminDataClient()

  // Desanexa produtos da categoria antes de apagar
  await client.from('products').update({ category_id: null }).eq('category_id', id)

  let q = client.from('categories').delete().eq('id', id)
  if (role !== 'master' && storeId) {
    q = q.eq('store_id', storeId)
  }
  const { error } = await q
  if (error) return { error: error.message }

  revalidatePath('/produtos/categorias')
  revalidatePath('/produtos')
  revalidatePath('/produtos/novo')
  return { success: true }
}
