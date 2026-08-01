import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Service-role client — bypasses Row Level Security.
 * Use ONLY in server actions that have already enforced auth checks.
 * Never expose this client or the service role key to the browser.
 */
export function createServiceClient() {
  const client = tryCreateServiceClient()
  if (!client) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurado. Adicione ao .env.local / secrets do desktop.',
    )
  }
  return client
}

/** Same as createServiceClient, but returns null instead of throwing. */
export function tryCreateServiceClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
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
