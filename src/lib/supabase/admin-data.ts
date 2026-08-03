import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { tryCreateServiceClient } from '@/lib/supabase/service'
import { getCurrentUser, type CurrentUser } from '@/lib/auth/roles'
import type { UserRole } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Prefer service role (works with offline desktop cookie). Falls back to
 * the user-scoped client when the secret is absent.
 *
 * @deprecated Prefira `getAppDataClient` / `getAppDataContext` de
 * `@/lib/supabase/app-data` em código novo — aplica loja + timeout certo.
 */
export async function getAdminDataClient(): Promise<SupabaseClient<Database>> {
  return tryCreateServiceClient() ?? (await createClient())
}

/** Role + store from DB when cookie/JWT is stale (common on Electron). */
export async function resolveAdminContext(user?: CurrentUser | null): Promise<{
  user: CurrentUser
  role: UserRole
  storeId: string | null
  storeIds: string[]
}> {
  const current = user ?? (await getCurrentUser())
  if (!current) {
    throw new Error('Não autenticado')
  }

  const service = tryCreateServiceClient()
  if (!service) {
    const fallback = current.storeId ? [current.storeId] : []
    return {
      user: current,
      role: current.role,
      storeId: current.storeId,
      storeIds: fallback,
    }
  }

  const [{ data: liveRole }, { data: memberships }] = await Promise.all([
    service.from('user_roles').select('role').eq('user_id', current.id).maybeSingle(),
    service.from('store_members').select('store_id').eq('user_id', current.id),
  ])

  const storeIds = (memberships ?? []).map((m) => m.store_id)
  const storeId =
    (current.storeId && storeIds.includes(current.storeId)
      ? current.storeId
      : null) ??
    storeIds[0] ??
    current.storeId ??
    null

  return {
    user: current,
    role: (liveRole?.role as UserRole | undefined) ?? current.role,
    storeId,
    storeIds: storeId
      ? Array.from(new Set([storeId, ...storeIds]))
      : storeIds,
  }
}

export function canAccessStoreRow(
  role: UserRole,
  callerStoreId: string | null,
  rowStoreId: string | null | undefined,
  storeIds: string[] = [],
): boolean {
  if (role === 'master') return true
  // Produtos antigos sem store_id — admin da loja pode editar
  if (!rowStoreId) return role === 'admin' || role === 'employee'
  if (callerStoreId && callerStoreId === rowStoreId) return true
  if (storeIds.includes(rowStoreId)) return true
  return false
}
