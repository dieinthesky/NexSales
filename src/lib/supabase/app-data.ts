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
 * Acesso canônico aos dados (site + .exe).
 *
 * Online no desktop → service role + filtro de loja.
 * Offline no desktop → withAppDataOrSqlite cai no SQLite em ~2s (service role
 * também tem abort de 4s por fetch — não trava o app).
 */

export type AppDataMode = 'service' | 'user'

export interface AppDataContext {
  client: SupabaseClient<Database>
  user: CurrentUser
  role: UserRole
  storeId: string | null
  storeIds: string[]
  mode: AppDataMode
  electron: boolean
}

/** Deadline curto para operações online antes de SQLite offline. */
const OFFLINE_FALLBACK_MS = 2_200

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

  // resolveAdminContext bate na rede — timeout curto + cookie como fallback
  if (electron) {
    try {
      const ctx = await Promise.race([
        resolveAdminContext(user),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_500)),
      ])
      if (ctx) {
        role = ctx.role
        storeId = ctx.storeId
        storeIds = ctx.storeIds
      }
    } catch {
      // cookie
    }
  } else {
    try {
      const ctx = await resolveAdminContext(user)
      role = ctx.role
      storeId = ctx.storeId
      storeIds = ctx.storeIds
    } catch {
      // cookie
    }
  }

  if (electron) {
    const service = tryCreateServiceClient(3_500)
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

export async function getAppDataClient(
  userHint?: CurrentUser | null,
): Promise<SupabaseClient<Database>> {
  const ctx = await getAppDataContext(userHint)
  return ctx.client
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyStoreFilter<T extends { eq: (c: string, v: string) => any }>(
  query: T,
  ctx: Pick<AppDataContext, 'role' | 'storeId' | 'mode'>,
  column = 'store_id',
): T {
  if (ctx.mode !== 'service') return query
  if (ctx.role === 'master' && !ctx.storeId) return query
  if (ctx.storeId) return query.eq(column, ctx.storeId) as T
  return query
}

export function assertStoreAccess(
  ctx: Pick<AppDataContext, 'role' | 'storeId' | 'storeIds'>,
  rowStoreId: string | null | undefined,
): boolean {
  return canAccessStoreRow(ctx.role, ctx.storeId, rowStoreId, ctx.storeIds)
}

/**
 * Online com deadline; no Electron cai no SQLite ao timeout/erro.
 * Sem rede, o PDV e as listas abrem com cache local.
 */
export async function withAppDataOrSqlite<T>(
  online: (ctx: AppDataContext) => Promise<T>,
  sqliteFallback: () => T | Promise<T>,
  timeoutMs = OFFLINE_FALLBACK_MS,
): Promise<T> {
  if (!isElectron()) {
    const ctx = await getAppDataContext()
    return online(ctx)
  }

  const onlinePromise = (async () => {
    const ctx = await getAppDataContext()
    return online(ctx)
  })()

  type Race =
    | { kind: 'ok'; value: T }
    | { kind: 'fail' }

  const raced = await Promise.race([
    onlinePromise
      .then((value): Race => ({ kind: 'ok', value }))
      .catch((): Race => ({ kind: 'fail' })),
    new Promise<Race>((resolve) =>
      setTimeout(() => resolve({ kind: 'fail' }), timeoutMs),
    ),
  ])

  if (raced.kind === 'ok') return raced.value

  // Não espera a promise online eternamente — SQLite responde agora
  onlinePromise.catch(() => {})

  try {
    return await sqliteFallback()
  } catch (sqliteErr) {
    console.warn('[app-data] sqlite fallback failed:', sqliteErr)
    // Re-tenta online se o SQLite falhar (primeira instalação)
    return onlinePromise
  }
}
