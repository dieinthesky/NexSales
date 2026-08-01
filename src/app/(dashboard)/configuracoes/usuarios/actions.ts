'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient, usernameToEmail } from '@/lib/supabase/service'
import { getCurrentUser, isAdmin, isMaster } from '@/lib/auth/roles'
import { createEmployeeSchema } from '@/lib/validations/auth.schema'
import type { UserRole } from '@/types/database'

export interface SetRoleResult {
  success: boolean
  error?: string
}

async function targetRole(userId: string): Promise<UserRole | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()
  return (data?.role as UserRole | undefined) ?? null
}

/**
 * Promote a user to admin or demote them back to employee.
 * Only Master can grant admin. Store admins only manage employees.
 */
export async function setUserRole(
  userId: string,
  role: UserRole,
): Promise<SetRoleResult> {
  if (!(await isAdmin())) {
    return { success: false, error: 'Apenas administradores podem alterar papéis.' }
  }

  if (role === 'master') {
    return { success: false, error: 'Não é permitido atribuir Master por aqui.' }
  }

  if (role === 'admin' && !(await isMaster())) {
    return { success: false, error: 'Somente a conta Master pode promover administradores.' }
  }

  const target = await targetRole(userId)
  if (target === 'master' && !(await isMaster())) {
    return { success: false, error: 'Não é possível alterar a conta Master.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_role', {
    p_user_id: userId,
    p_role: role,
  })

  if (error) {
    if (error.message.includes('cannot_demote_self')) {
      return {
        success: false,
        error: 'Você não pode remover o próprio acesso de administrador.',
      }
    }
    if (error.message.includes('only_master_can_grant_admin')) {
      return {
        success: false,
        error: 'Somente a conta Master pode promover administradores.',
      }
    }
    if (error.message.includes('cannot_modify_master')) {
      return { success: false, error: 'Não é possível alterar a conta Master.' }
    }
    return { success: false, error: error.message }
  }

  revalidatePath('/configuracoes/usuarios')
  return { success: true }
}

export async function createEmployee(formData: {
  firstName: string
  lastName: string
  username: string
  password: string
}): Promise<{ success?: boolean; error?: string }> {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem criar funcionários.' }
  }

  const parsed = createEmployeeSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const current = await getCurrentUser()
  if (!current?.storeId && !(await isMaster())) {
    return { error: 'Sua conta não está vinculada a uma loja.' }
  }

  const { firstName, lastName, username, password } = parsed.data
  const email = usernameToEmail(username)

  const service = createServiceClient()

  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  })

  if (error) {
    if (
      error.message.toLowerCase().includes('already registered') ||
      error.message.toLowerCase().includes('already been registered') ||
      error.message.toLowerCase().includes('unique')
    ) {
      return { error: 'Esse nome de usuário já está em uso.' }
    }
    return { error: error.message }
  }

  const newUserId = created.user?.id
  if (newUserId && current?.storeId) {
    await service.from('store_members').upsert({
      store_id: current.storeId,
      user_id: newUserId,
      role: 'employee',
    })
    await service.from('user_roles').upsert({
      user_id: newUserId,
      role: 'employee',
    })
  }

  revalidatePath('/configuracoes/usuarios')
  return { success: true }
}

export async function resetEmployeePassword(
  userId: string,
  newPassword: string,
): Promise<{ success?: boolean; error?: string }> {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem redefinir senhas.' }
  }

  const target = await targetRole(userId)
  if (target === 'master' && !(await isMaster())) {
    return { error: 'Não é possível alterar a conta Master.' }
  }

  if (newPassword.length < 6) {
    return { error: 'Senha deve ter pelo menos 6 caracteres.' }
  }

  const service = createServiceClient()
  const { error } = await service.auth.admin.updateUserById(userId, {
    password: newPassword,
  })

  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteEmployee(
  userId: string,
): Promise<{ success?: boolean; error?: string }> {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem excluir usuários.' }
  }

  const current = await getCurrentUser()
  if (current?.id === userId) {
    return { error: 'Você não pode excluir a própria conta.' }
  }

  const target = await targetRole(userId)
  if (target === 'master') {
    return { error: 'Não é possível excluir a conta Master.' }
  }
  if (target === 'admin' && !(await isMaster())) {
    return { error: 'Somente a Master pode excluir outro administrador.' }
  }

  const service = createServiceClient()
  const { error } = await service.auth.admin.deleteUser(userId)

  if (error) return { error: error.message }

  revalidatePath('/configuracoes/usuarios')
  return { success: true }
}
