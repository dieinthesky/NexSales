import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Service-role client — bypasses Row Level Security.
 * Use ONLY in server actions that have already enforced auth checks.
 * Never expose this client or the service role key to the browser.
 *
 * Every fetch is hard-capped (default 4s) so offline Electron never hangs
 * waiting for the OS TCP timeout (~75s).
 */
const DEFAULT_SERVICE_FETCH_MS = 4_000

export function createServiceClient(timeoutMs = DEFAULT_SERVICE_FETCH_MS) {
  const client = tryCreateServiceClient(timeoutMs)
  if (!client) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurado. Adicione ao .env.local / secrets do desktop.',
    )
  }
  return client
}

/** Same as createServiceClient, but returns null instead of throwing. */
export function tryCreateServiceClient(
  timeoutMs = DEFAULT_SERVICE_FETCH_MS,
): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        // AbortSignal.any not everywhere — compose timeouts manually
        const timeoutSignal =
          typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
            ? AbortSignal.timeout(timeoutMs)
            : undefined

        if (!timeoutSignal) {
          const controller = new AbortController()
          const t = setTimeout(() => controller.abort(), timeoutMs)
          return fetch(input, { ...init, signal: controller.signal }).finally(() =>
            clearTimeout(t),
          )
        }

        if (init?.signal) {
          // Prefer the stricter deadline between caller and our timeout
          const controller = new AbortController()
          const onAbort = () => controller.abort()
          init.signal.addEventListener('abort', onAbort)
          timeoutSignal.addEventListener('abort', onAbort)
          return fetch(input, { ...init, signal: controller.signal }).finally(() => {
            init.signal?.removeEventListener('abort', onAbort)
            timeoutSignal.removeEventListener('abort', onAbort)
          })
        }

        return fetch(input, { ...init, signal: timeoutSignal })
      },
    },
  })
}

/** Converts a plain username to the internal Supabase email format. */
export function usernameToEmail(username: string): string {
  return `${username.toLowerCase().trim()}@vendas-app.interno`
}

/** Returns true if the email was generated internally (not a real address). */
export function isInternalEmail(email: string): boolean {
  return email.endsWith('@vendas-app.interno')
}

/** Extracts the username from an internal email, or returns the full email. */
export function emailToUsername(email: string): string {
  return isInternalEmail(email) ? email.split('@')[0] : email
}
