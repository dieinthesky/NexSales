import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

// Web: curto para o tryQuery + fallback SQLite no desktop offline não travar a UI
const QUERY_TIMEOUT_MS = 3_000

// Desktop (.exe) e sync: token fraco + latência normal — 3s causava falso offline
const ELECTRON_TIMEOUT_MS = 25_000
const SYNC_TIMEOUT_MS = 30_000

function isElectronServer(): boolean {
  return process.env.ELECTRON_APP === 'true'
}

/**
 * Sync / operações pesadas (venda, pull completo).
 */
export async function createSyncClient() {
  return _makeClient(isElectronServer() ? ELECTRON_TIMEOUT_MS : SYNC_TIMEOUT_MS)
}

/**
 * Client padrão de páginas. No Electron usa o timeout longo para parar de
 * abortar listagens e recibos a cada 3s.
 */
export async function createClient() {
  return _makeClient(isElectronServer() ? ELECTRON_TIMEOUT_MS : QUERY_TIMEOUT_MS)
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
            // Server Component context — cookies set by middleware
          }
        },
      },
    },
  )
}
