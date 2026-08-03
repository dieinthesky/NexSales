import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'
import { displayName, initials } from '@/lib/utils/user-display'
import { OFFLINE_COOKIE_NAME, readOfflineSession } from '@/lib/supabase/offline-cookie'
import type { Database, UserRole } from '@/types/database'

export interface CurrentUser {
  id: string
  email: string | null
  role: UserRole
  storeId: string | null
  storeName: string | null
  firstName: string | null
  lastName: string | null
  /** Pretty name for UI (falls back to email username). */
  displayName: string
  /** Two-letter initials for avatars. */
  initials: string
}

function normalizeRole(role: string | null | undefined): UserRole {
  if (role === 'master' || role === 'admin' || role === 'employee') return role
  return 'employee'
}

/**
 * Returns the current authenticated user with their role + profile.
 * Returns null when there is no session.
 *
 * Memoized per-request via React `cache` so multiple components/layouts
 * in the same render hit Supabase only once.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies()

  const offlineCookie = cookieStore.get(OFFLINE_COOKIE_NAME)
  const offlineSession = offlineCookie
    ? readOfflineSession(offlineCookie.value)
    : null

  function fromOfflineCookie() {
    if (!offlineSession) return null
    const email = offlineSession.email
    return {
      id: offlineSession.userId,
      email,
      role: normalizeRole(offlineSession.role),
      storeId: offlineSession.storeId ?? null,
      storeName: null as string | null,
      firstName: null as string | null,
      lastName: null as string | null,
      displayName: displayName({ firstName: null, lastName: null, email }),
      initials: initials({ firstName: null, lastName: null, email }),
    }
  }

  // Desktop offline-first: cookie assinada sem rede (PDV não espera Supabase)
  if (process.env.ELECTRON_APP === 'true' && offlineSession) {
    return fromOfflineCookie()
  }

  const AUTH_TIMEOUT_MS = 3_000
  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)

  const supabaseWithTimeout = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (url: RequestInfo | URL, init?: RequestInit) =>
          fetch(url, { ...init, signal: controller.signal }),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Component
          }
        },
      },
    },
  )

  let user: Awaited<ReturnType<typeof supabaseWithTimeout.auth.getUser>>['data']['user'] = null

  try {
    const { data } = await supabaseWithTimeout.auth.getUser()
    user = data.user
  } catch {
    // timeout / rede
  } finally {
    clearTimeout(abortTimer)
  }

  if (user) {
    try {
      const supabase = await createClient()
      const profilePromise = Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('store_members')
          .select('store_id')
          .eq('user_id', user.id)
          .maybeSingle(),
      ])

      // Offline com JWT stale na cookie: não espera 3s×N nas roles
      const profileRace = await Promise.race([
        profilePromise.then((rows) => ({ ok: true as const, rows })),
        new Promise<{ ok: false }>((r) => setTimeout(() => r({ ok: false }), 2_000)),
      ])

      if (!profileRace.ok) {
        // Prefer cookie offline (tem role/store) se existir
        const off = fromOfflineCookie()
        if (off) return off
        return {
          id: user.id,
          email: user.email ?? null,
          role: 'employee',
          storeId: null,
          storeName: null,
          firstName: null,
          lastName: null,
          displayName: displayName({
            firstName: null,
            lastName: null,
            email: user.email ?? null,
          }),
          initials: initials({
            firstName: null,
            lastName: null,
            email: user.email ?? null,
          }),
        }
      }

      const [{ data: roleRow }, { data: profileRow }, { data: membership }] =
        profileRace.rows

      const role = normalizeRole(roleRow?.role)
      const firstName = profileRow?.first_name ?? null
      const lastName = profileRow?.last_name ?? null
      const email = user.email ?? null
      const storeId = membership?.store_id ?? offlineSession?.storeId ?? null
      let storeName: string | null = null
      if (storeId) {
        try {
          const { data: storeRow } = await supabase
            .from('stores')
            .select('name')
            .eq('id', storeId)
            .maybeSingle()
          storeName = storeRow?.name ?? null
        } catch {
          // ignore
        }
      }

      return {
        id: user.id,
        email,
        role,
        storeId,
        storeName,
        firstName,
        lastName,
        displayName: displayName({ firstName, lastName, email }),
        initials: initials({ firstName, lastName, email }),
      }
    } catch {
      const off = fromOfflineCookie()
      if (off) return off
    }
  }

  return fromOfflineCookie()
})

/** Admin da loja ou Master da plataforma. */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.role === 'admin' || user?.role === 'master'
}

export async function isMaster(): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.role === 'master'
}

/**
 * Server-side guard for authenticated pages. Redirects unauthenticated users to /login.
 */
export async function requireAuth(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

/**
 * Server-side guard for admin-only pages. Redirects non-admins to /vendas/nova
 * (their effective home) and unauthenticated users to /login.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin' && user.role !== 'master') redirect('/vendas/nova')
  return user
}

export async function requireMaster(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'master') redirect('/vendas/nova')
  return user
}

/** Store id da sessão; falha com erro amigável se o usuário não tiver loja. */
export async function requireStoreId(): Promise<{ user: CurrentUser; storeId: string }> {
  const user = await requireAuth()
  if (!user.storeId) {
    throw new Error('Usuário sem loja vinculada. Peça ao suporte para associar sua conta.')
  }
  return { user, storeId: user.storeId }
}
