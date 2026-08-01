'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient, usernameToEmail } from '@/lib/supabase/service'
import { isMaster } from '@/lib/auth/roles'
import { createEmployeeSchema } from '@/lib/validations/auth.schema'

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
  const service = createServiceClient()

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

  if (error) {
    await service.auth.admin.deleteUser(created.user.id)
    return { error: error.message }
  }

  revalidatePath('/configuracoes/lojas')
  revalidatePath('/configuracoes/usuarios')
  return { success: true, storeId: storeId as string }
}

export async function resetStoreOperations(
  storeId: string,
): Promise<{ success?: boolean; error?: string }> {
  if (!(await isMaster())) {
    return { error: 'Apenas a conta Master pode resetar lojas.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('master_reset_store_operations', {
    p_store_id: storeId,
  })

  if (error) return { error: error.message }

  revalidatePath('/configuracoes/lojas')
  revalidatePath('/vendas')
  revalidatePath('/relatorios')
  return { success: true }
}
