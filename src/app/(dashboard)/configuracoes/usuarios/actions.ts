'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient, usernameToEmail } from '@/lib/supabase/service'
import { getCurrentUser, isAdmin, isMaster, requireAdmin } from '@/lib/auth/roles'
import { createEmployeeSchema } from '@/lib/validations/auth.schema'
import type { UserRole } from '@/types/database'

export interface SetRoleResult {
  success: boolean
  error?: string
}

export interface AdminUserRow {
  user_id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: UserRole
  created_at: string
  last_sign_in_at: string | null
}

/**
 * Lista usuários com service role após requireAdmin().
 * Evita o "forbidden" do RPC quando a sessão JWT expirou (comum no app desktop
 * com cookie offline ainda válido).
 */
export async function listAdminUsers(): Promise<{
  users: AdminUserRow[]
  viewerRole: UserRole
  error?: string
}> {
  const current = await requireAdmin()
  const service = createServiceClient()

  // Cookie offline pode estar desatualizado (ex.: ainda "admin" após promover a master).
  // Confia no banco via service role.
  const [{ data: liveRole }, { data: liveMembership }] = await Promise.all([
    service.from('user_roles').select('role').eq('user_id', current.id).maybeSingle(),
    service
      .from('store_members')
      .select('store_id')
      .eq('user_id', current.id)
      .maybeSingle(),
  ])
  const effectiveRole = (liveRole?.role as UserRole | undefined) ?? current.role
  const effectiveStoreId = liveMembership?.store_id ?? current.storeId

  const [{ data: authData, error: authError }, rolesRes, profilesRes, membersRes] =
    await Promise.all([
      service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      service.from('user_roles').select('user_id, role'),
      service.from('profiles').select('user_id, first_name, last_name'),
      service.from('store_members').select('user_id, store_id'),
    ])

  if (authError) {
    return { users: [], viewerRole: effectiveRole, error: authError.message }
  }

  const roleByUser = new Map(
    (rolesRes.data ?? []).map((r) => [r.user_id, r.role as UserRole]),
  )
  const profileByUser = new Map(
    (profilesRes.data ?? []).map((p) => [
      p.user_id,
      { first_name: p.first_name, last_name: p.last_name },
    ]),
  )
  const storeIdsByUser = new Map<string, Set<string>>()
  for (const m of membersRes.data ?? []) {
    const set = storeIdsByUser.get(m.user_id) ?? new Set<string>()
    set.add(m.store_id)
    storeIdsByUser.set(m.user_id, set)
  }

  const isMasterCaller = effectiveRole === 'master'
  const callerStoreId = effectiveStoreId

  const users: AdminUserRow[] = (authData.users ?? [])
    .map((u) => {
      const role = roleByUser.get(u.id) ?? 'employee'
      const profile = profileByUser.get(u.id)
      return {
        user_id: u.id,
        email: u.email ?? '',
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        role,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      } satisfies AdminUserRow
    })
    .filter((u) => {
      if (isMasterCaller) return true
      if (u.role === 'master') return false
      if (!callerStoreId) return false
      return storeIdsByUser.get(u.user_id)?.has(callerStoreId) ?? false
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return { users, viewerRole: effectiveRole }
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

  const current = await getCurrentUser()
  if (current?.id === userId && role !== current.role) {
    if (current.role === 'master' || current.role === 'admin') {
      return {
        success: false,
        error: 'Você não pode remover o próprio acesso de administrador.',
      }
    }
  }

  const service = createServiceClient()
  const { error } = await service.from('user_roles').upsert({
    user_id: userId,
    role,
    updated_at: new Date().toISOString(),
  })

  if (error) {
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
