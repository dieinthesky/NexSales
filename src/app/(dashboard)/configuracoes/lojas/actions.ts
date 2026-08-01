'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { tryCreateServiceClient, usernameToEmail } from '@/lib/supabase/service'
import { isMaster } from '@/lib/auth/roles'
import { createEmployeeSchema } from '@/lib/validations/auth.schema'
import { getAdminDataClient } from '@/lib/supabase/admin-data'

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

/** Master: cria loja + dono admin + copia catálogo modelo (estoque 0). */
export async function provisionStore(form: {
  storeName: string
  ownerFirstName: string
  ownerLastName: string
  ownerUsername: string
  ownerPassword: string
  copyCatalog?: boolean
}): Promise<{ success?: boolean; storeId?: string; error?: string }> {
  if (!(await isMaster())) {
    return { error: 'Apenas a conta Master pode criar lojas.' }
  }

  const storeName = form.storeName.trim()
  if (storeName.length < 2) return { error: 'Nome da loja inválido.' }

  const parsed = createEmployeeSchema.safeParse({
    firstName: form.ownerFirstName,
    lastName: form.ownerLastName,
    username: form.ownerUsername,
    password: form.ownerPassword,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const slug = slugify(storeName) || `loja-${Date.now()}`
  const email = usernameToEmail(parsed.data.username)
  const service = tryCreateServiceClient()
  if (!service) {
    return { error: 'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.' }
  }

  const { data: created, error: userError } = await service.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
    },
  })

  if (userError || !created.user) {
    if (userError?.message.toLowerCase().includes('already')) {
      return { error: 'Esse usuário já existe. Use outro login para o dono.' }
    }
    return { error: userError?.message ?? 'Falha ao criar usuário dono.' }
  }

  const supabase = await createClient()
  const { data: storeId, error } = await supabase.rpc('master_provision_store', {
    p_store_name: storeName,
    p_store_slug: slug,
    p_owner_user_id: created.user.id,
    p_copy_catalog: form.copyCatalog !== false,
  })

  if (!error && storeId) {
    revalidatePath('/configuracoes/lojas')
    revalidatePath('/configuracoes/usuarios')
    return { success: true, storeId: storeId as string }
  }

  // Fallback when JWT offline/expired: provision with service role
  const { data: store, error: storeErr } = await service
    .from('stores')
    .insert({ name: storeName, slug, is_template: false })
    .select('id')
    .single()

  if (storeErr || !store) {
    await service.auth.admin.deleteUser(created.user.id)
    return { error: storeErr?.message ?? error?.message ?? 'Falha ao criar loja.' }
  }

  await service.from('store_members').upsert({
    store_id: store.id,
    user_id: created.user.id,
    role: 'admin',
  })
  await service.from('user_roles').upsert({
    user_id: created.user.id,
    role: 'admin',
  })

  if (form.copyCatalog !== false) {
    const { data: template } = await service
      .from('stores')
      .select('id')
      .eq('is_template', true)
      .limit(1)
      .maybeSingle()

    if (template?.id) {
      const { data: cats } = await service
        .from('categories')
        .select('id, name')
        .eq('store_id', template.id)
      const catMap = new Map<string, string>()
      for (const c of cats ?? []) {
        const { data: nc } = await service
          .from('categories')
          .insert({ name: c.name, store_id: store.id })
          .select('id')
          .single()
        if (nc) catMap.set(c.id, nc.id)
      }
      const { data: prods } = await service
        .from('products')
        .select(
          'code, name, description, sale_price, cost_price, min_stock, category_id, track_stock, image_url',
        )
        .eq('store_id', template.id)
        .eq('is_active', true)
      if (prods && prods.length > 0) {
        await service.from('products').insert(
          prods.map((p) => ({
            ...p,
            stock_quantity: 0,
            store_id: store.id,
            category_id: p.category_id ? (catMap.get(p.category_id) ?? null) : null,
            is_active: true,
          })),
        )
      }
    }
  }

  revalidatePath('/configuracoes/lojas')
  revalidatePath('/configuracoes/usuarios')
  return { success: true, storeId: store.id }
}

/**
 * Master: zera vendas, fiado e clientes da loja. Mantém catálogo.
 * Em lojas cliente também zera estoque. Usa service role (não depende do JWT).
 */
export async function resetStoreOperations(
  storeId: string,
): Promise<{ success?: boolean; error?: string }> {
  if (!(await isMaster())) {
    return { error: 'Apenas a conta Master pode resetar lojas.' }
  }

  const service = tryCreateServiceClient()
  if (!service) {
    return { error: 'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.' }
  }

  const { data: store, error: storeError } = await service
    .from('stores')
    .select('id, name, is_template')
    .eq('id', storeId)
    .maybeSingle()

  if (storeError || !store) {
    return { error: storeError?.message ?? 'Loja não encontrada.' }
  }

  const { error: payErr } = await service
    .from('debt_payments')
    .delete()
    .eq('store_id', storeId)
  if (payErr) return { error: payErr.message }

  const { error: salesErr } = await service.from('sales').delete().eq('store_id', storeId)
  if (salesErr) return { error: salesErr.message }

  const { error: custErr } = await service
    .from('customers')
    .delete()
    .eq('store_id', storeId)
  if (custErr) return { error: custErr.message }

  if (!store.is_template) {
    const { error: stockErr } = await service
      .from('products')
      .update({ stock_quantity: 0 })
      .eq('store_id', storeId)
    if (stockErr) return { error: stockErr.message }
  }

  revalidatePath('/configuracoes/lojas')
  revalidatePath('/vendas')
  revalidatePath('/vendas/nova')
  revalidatePath('/dashboard')
  revalidatePath('/produtos')
  revalidatePath('/clientes')
  revalidatePath('/relatorios')
  return { success: true }
}

export async function listStoresForMaster(): Promise<{
  stores: {
    id: string
    name: string
    slug: string
    is_template: boolean
    created_at: string
  }[]
  error?: string
}> {
  if (!(await isMaster())) {
    return { stores: [], error: 'Apenas Master.' }
  }
  const client = await getAdminDataClient()
  const { data, error } = await client
    .from('stores')
    .select('id, name, slug, is_template, created_at')
    .order('created_at', { ascending: false })
  if (error) return { stores: [], error: error.message }
  return { stores: data ?? [] }
}
