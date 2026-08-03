import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

/** Páginas: falha em 3s quando offline → SQLite/cookie sem travar. */
const QUERY_TIMEOUT_MS = 3_000

/** Sync / venda online com mais fôlego. */
const SYNC_TIMEOUT_MS = 30_000

export async function createSyncClient() {
  return _makeClient(SYNC_TIMEOUT_MS)
}

export async function createClient() {
  return _makeClient(QUERY_TIMEOUT_MS)
}

async function _makeClient(timeoutMs: number) {
  const cookieStore = await cookies()
  const controller = new AbortController()
  setTimeout(() => controller.abort(), timeoutMs)

  return createServerClient<Database>(
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
}
