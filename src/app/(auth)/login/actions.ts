'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { saveOfflineCredentials, verifyOfflineCredentials } from '@/lib/offline/local-auth'
import { createOfflineSessionCookie, OFFLINE_COOKIE_NAME } from '@/lib/supabase/offline-cookie'

/**
 * Where to send a user right after authenticating, based on their role.
 * Admins go to the dashboard with full KPIs; employees go straight to the PDV.
 */
async function postLoginPath(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return '/login'

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  return roleRow?.role === 'admin' || roleRow?.role === 'master'
    ? '/dashboard'
    : '/vendas/nova'
}

/** True when the error indicates no network, not a credential failure. */
function isNetworkError(error: unknown): boolean {
  if (!error) return false
  const name = error instanceof Error ? error.constructor.name : ''
  const msg = error instanceof Error ? error.message : String(error)
  return (
    name === 'AuthRetryableFetchError' ||
    msg.includes('Failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('ETIMEDOUT')
  )
}

export async function signIn(usernameOrEmail: string, password: string) {
  const supabase = await createClient()

  // If the input has no "@", treat it as a username → map to internal email.
  // Admin accounts with real emails still work by typing their full email.
  const email = usernameOrEmail.includes('@')
    ? usernameOrEmail.trim()
    : `${usernameOrEmail.toLowerCase().trim()}@vendas-app.interno`

  const AUTH_TIMEOUT_MS = 8_000
  const authResult = await Promise.race([
    supabase.auth.signInWithPassword({ email, password }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('fetch failed: auth timeout')), AUTH_TIMEOUT_MS),
    ),
  ]).catch((err: unknown) => ({ data: { user: null, session: null }, error: err }))

  const { data, error } = authResult as Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>

  if (error) {
    if (isNetworkError(error)) {
      // Supabase unreachable — attempt offline authentication
      let offlineUser: { userId: string; email: string; role: string } | null = null
      let diagError: string | null = null

      try {
        offlineUser = verifyOfflineCredentials(email, password)
      } catch (e) {
        diagError = e instanceof Error ? e.message : String(e)
      }

      if (offlineUser) {
        // Valid local credentials: issue an offline session cookie then redirect.
        // redirect() sends Set-Cookie + Location in the same 303 response so the
        // browser commits the cookie before following the redirect — more reliable
        // than setting the cookie then doing client-side navigation.
        const session = createOfflineSessionCookie(
          offlineUser.userId,
          offlineUser.email,
          offlineUser.role,
        )
        const cookieStore = await cookies()
        cookieStore.set(OFFLINE_COOKIE_NAME, session.value, {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: session.maxAge,
          path: '/',
        })
        redirect(offlineUser.role === 'admin' ? '/dashboard' : '/vendas/nova')
      }

      if (diagError) {
        console.error('[offline-auth diag]', diagError)
      }

      return {
        error: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
        offline: true,
      }
    }

    return { error: 'Usuário ou senha inválidos.' }
  }

  // Online login succeeded — persist credentials and set offline session cookie so the
  // app keeps working if the connection drops before the next Supabase token refresh.
  let redirectPath: string | null = null

  if (data.user) {
    try {
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle()

      const role = roleRow?.role ?? 'employee'
      redirectPath = role === 'admin' || role === 'master' ? '/dashboard' : '/vendas/nova'

      const { data: membership } = await supabase
        .from('store_members')
        .select('store_id')
        .eq('user_id', data.user.id)
        .maybeSingle()
      const storeId = membership?.store_id ?? null

      saveOfflineCredentials(email, password, data.user.id, role)

      // 7 days — refreshed on every online login so the user can navigate offline
      // without being kicked to /login just because supabase.auth.getUser() times out.
      const ONLINE_OFFLINE_TTL = 7 * 24 * 60 * 60
      const session = createOfflineSessionCookie(
        data.user.id,
        email,
        role,
        ONLINE_OFFLINE_TTL,
        storeId,
      )
      const cookieStore = await cookies()
      cookieStore.set(OFFLINE_COOKIE_NAME, session.value, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: session.maxAge,
        path: '/',
      })
    } catch {
      // Non-critical: never let caching break a successful login
    }
  }

  revalidatePath('/', 'layout')
  // Use the role already fetched above to avoid a second round-trip to Supabase.
  // Falls back to postLoginPath() only if the role query above failed.
  redirect(redirectPath ?? (await postLoginPath()))
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // Clear the offline session cookie on explicit logout
  const cookieStore = await cookies()
  cookieStore.delete(OFFLINE_COOKIE_NAME)

  redirect('/login')
}

export async function forgotPassword(email: string) {
  const supabase = await createClient()
  const headersList = await headers()
  const host = headersList.get('host') ?? 'localhost:3000'
  const proto = (headersList.get('x-forwarded-proto') ?? 'http').split(',')[0].trim()
  const redirectTo = `${proto}://${host}/redefinir-senha`

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) return { error: 'Não foi possível enviar o email. Tente novamente.' }
  return { success: true }
}
