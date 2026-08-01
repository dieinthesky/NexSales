'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { categorySchema } from '@/lib/validations/category.schema'
import { getCurrentUser, isAdmin } from '@/lib/auth/roles'

export async function createCategory(name: string) {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem gerenciar categorias.' }
  }

  const parsed = categorySchema.safeParse({ name })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const user = await getCurrentUser()
  if (!user?.storeId) {
    return { error: 'Sua conta não está vinculada a uma loja.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .insert({ name: parsed.data.name, store_id: user.storeId })
    .select('id, name, created_at')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Categoria já existe.' }
    return { error: error.message }
  }

  revalidatePath('/produtos/categorias')
  revalidatePath('/produtos')
  return { success: true, category: data }
}

export async function deleteCategory(id: string) {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem gerenciar categorias.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/produtos/categorias')
  revalidatePath('/produtos')
  return { success: true }
}
