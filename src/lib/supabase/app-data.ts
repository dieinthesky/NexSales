import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { UserRole } from '@/types/database'
import {
  getCurrentUser,
  type CurrentUser,
} from '@/lib/auth/roles'
import { isElectron } from '@/lib/db/client'
import { createClient } from '@/lib/supabase/server'
import { tryCreateServiceClient } from '@/lib/supabase/service'
import {
  resolveAdminContext,
  canAccessStoreRow,
} from '@/lib/supabase/admin-data'

/**
 * Acesso canônico aos dados do app (site + .exe).
 *
 * Problema antigo do desktop:
 *  - JWT do Supabase expira e a cookie "offline" ainda deixa o usuário logado
 *  - createClient abortava em 3s → falso offline / 404 / catálogo incompleto
 *  - cada tela patchava de um jeito
 *
 * Regra única:
 *  1. Exige usuário autenticado (cookie JWT ou offline assinado)
 *  2. No Electron (e quando service role existe), preferimos service role
 *     + filtro de loja no código (mesma segurança do app, dados completos)
 *  3. Timeout longo (createSyncClient) se cair no JWT do usuário
 *  4. Toda query server usa isto — não "inventar" outro client solto
 */

export type AppDataMode = 'service' | 'user'

export interface AppDataContext {
  /** Cliente Supabase pronto para queries */
  client: SupabaseClient<Database>
  user: CurrentUser
  role: UserRole
  /** Loja principal (sessão / membership) */
  storeId: string | null
  /** Todas as lojas acessíveis */
  storeIds: string[]
  mode: AppDataMode
  /** true no shell Windows */
  electron: boolean
}

/**
 * Resolve client + loja para o usuário logado.
 * @throws Error('unauthenticated') se não houver sessão
 */
export async function getAppDataContext(
  userHint?: CurrentUser | null,
): Promise<AppDataContext> {
  const user = userHint ?? (await getCurrentUser())
  if (!user) {
    throw new Error('unauthenticated')
  }

  const electron = isElectron()
  let role = user.role
  let storeId = user.storeId
  let storeIds = user.storeId ? [user.storeId] : []

  try {
    const ctx = await resolveAdminContext(user)
    role = ctx.role
    storeId = ctx.storeId
    storeIds = ctx.storeIds
  } catch {
    // mantém cookie
  }

  // Desktop (e builds com secret): service role — dados iguais ao site admin
  if (electron) {
    const service = tryCreateServiceClient()
    if (service) {
      return {
        client: service,
        user,
        role,
        storeId,
        storeIds,
        mode: 'service',
        electron: true,
      }
    }
  }

  // Web / fallback: JWT (timeout já é longo no Electron via createClient)
  const userClient = await createClient()

  return {
    client: userClient,
    user,
    role,
    storeId,
    storeIds,
    mode: 'user',
    electron,
  }
}

/**
 * Atalho: só o client.
 */
export async function getAppDataClient(
  userHint?: CurrentUser | null,
): Promise<SupabaseClient<Database>> {
  const ctx = await getAppDataContext(userHint)
  return ctx.client
}

/**
 * Aplica filtro de loja em queries (service role não tem RLS).
 * Master sem storeId: sem filtro (vê tudo).
 * Admin/employee: filtra store_id = loja do usuário.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyStoreFilter<T extends { eq: (c: string, v: string) => any }>(
  query: T,
  ctx: Pick<AppDataContext, 'role' | 'storeId' | 'mode'>,
  column = 'store_id',
): T {
  // JWT+RLS já isola; só forza store no service role
  if (ctx.mode !== 'service') return query
  if (ctx.role === 'master' && !ctx.storeId) return query
  if (ctx.storeId) return query.eq(column, ctx.storeId) as T
  return query
}

/** Garante que a linha pertence à loja do usuário (service role). */
export function assertStoreAccess(
  ctx: Pick<AppDataContext, 'role' | 'storeId' | 'storeIds'>,
  rowStoreId: string | null | undefined,
): boolean {
  return canAccessStoreRow(ctx.role, ctx.storeId, rowStoreId, ctx.storeIds)
}

/**
 * Helper: tenta a operação com getAppDataContext; se falhar rede no Electron,
 * chama o fallback SQLite.
 */
export async function withAppDataOrSqlite<T>(
  online: (ctx: AppDataContext) => Promise<T>,
  sqliteFallback: () => T | Promise<T>,
): Promise<T> {
  try {
    const ctx = await getAppDataContext()
    return await online(ctx)
  } catch (err) {
    if (isElectron()) {
      try {
        return await sqliteFallback()
      } catch (sqliteErr) {
        console.warn('[app-data] online + sqlite failed:', err, sqliteErr)
        throw err
      }
    }
    throw err
  }
}
