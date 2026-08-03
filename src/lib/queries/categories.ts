import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getAdminDataClient, resolveAdminContext } from '@/lib/supabase/admin-data'
import type { Category } from '@/types/database'
import type { CurrentUser } from '@/lib/auth/roles'

/**
 * Lista categorias da loja com service role (JWT fraco / offline não some com tudo).
 * Se a loja não tem categorias, clona nomes usados nos produtos ou cria "Alimentos".
 * Remapeia produtos com category_id de outra loja (catálogo modelo).
 */
export async function listCategoriesForCurrentStore(
  user?: CurrentUser | null,
): Promise<Category[]> {
  const ctx = await resolveAdminContext(user ?? undefined)
  const storeId = ctx.storeId
  if (!storeId && ctx.role !== 'master') return []

  const admin = await getAdminDataClient()
  const userClient = await createClient()

  async function fetchForStore(sid: string | null): Promise<Category[]> {
    if (!sid) {
      const { data } = await admin.from('categories').select('*').order('name')
      return (data as Category[] | null) ?? []
    }
    let { data, error } = await admin
      .from('categories')
      .select('*')
      .eq('store_id', sid)
      .order('name')

    if (error || !data) {
      const rls = await userClient
        .from('categories')
        .select('*')
        .eq('store_id', sid)
        .order('name')
      data = rls.data
    }

    return (data as Category[] | null) ?? []
  }

  if (!storeId) {
    return fetchForStore(null)
  }

  let cats = await fetchForStore(storeId)
  await healStoreCategories(admin, storeId, cats)
  cats = await fetchForStore(storeId)

  if (cats.length === 0) {
    const { data: created } = await admin
      .from('categories')
      .upsert({ name: 'Alimentos', store_id: storeId }, { onConflict: 'store_id,name' })
      .select('*')
      .maybeSingle()
    if (created) cats = [created as Category]
    else cats = await fetchForStore(storeId)
  }

  return cats
}

async function healStoreCategories(
  admin: Awaited<ReturnType<typeof getAdminDataClient>>,
  storeId: string,
  localCats: Category[],
): Promise<void> {
  const { data: products } = await admin
    .from('products')
    .select('category_id')
    .eq('store_id', storeId)
    .not('category_id', 'is', null)

  const usedIds = [
    ...new Set(
      (products ?? [])
        .map((p) => p.category_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  if (usedIds.length === 0) return

  const localIds = new Set(localCats.map((c) => c.id))
  const orphanIds = usedIds.filter((id) => !localIds.has(id))
  if (orphanIds.length === 0) return

  const { data: foreignCats } = await admin
    .from('categories')
    .select('id, name')
    .in('id', orphanIds)

  const nameMap = new Map<string, string>()
  for (const fc of foreignCats ?? []) {
    nameMap.set(fc.id, fc.name)
  }

  // Categorias órfãs (FK quebrada) → genérico
  for (const id of orphanIds) {
    if (!nameMap.has(id)) nameMap.set(id, 'Alimentos')
  }

  for (const name of new Set(nameMap.values())) {
    await admin
      .from('categories')
      .upsert({ name, store_id: storeId }, { onConflict: 'store_id,name' })
  }

  const { data: local } = await admin
    .from('categories')
    .select('id, name')
    .eq('store_id', storeId)

  const localByName = new Map((local ?? []).map((c) => [c.name, c.id]))

  for (const [oldId, name] of nameMap) {
    const newId = localByName.get(name)
    if (newId && newId !== oldId) {
      await admin
        .from('products')
        .update({ category_id: newId })
        .eq('store_id', storeId)
        .eq('category_id', oldId)
    }
  }
}
