/**
 * Status do catálogo local (IndexedDB) — UI do caixa e gate offline.
 */
import 'client-only'
import { getDB } from './db'
import { mayUseNetwork } from './network'
import { syncAll } from './sync'

export interface LocalCatalogStatus {
  productCount: number
  lastSyncAt: string | null
  /** true se há produtos utilizáveis no PDV (sem códigos __reservados) */
  ready: boolean
  online: boolean
}

function isReserved(code: string | null | undefined): boolean {
  return Boolean(code && code.startsWith('__'))
}

export async function getLocalCatalogStatus(): Promise<LocalCatalogStatus> {
  const online = mayUseNetwork()
  try {
    const db = getDB()
    const all = await db.products.toArray()
    const usable = all.filter((p) => p.is_active && !isReserved(p.code))
    const meta = await db.syncMeta.get('products')
    return {
      productCount: usable.length,
      lastSyncAt: meta?.lastSyncAt ?? null,
      ready: usable.length > 0,
      online,
    }
  } catch {
    return {
      productCount: 0,
      lastSyncAt: null,
      ready: false,
      online,
    }
  }
}

/**
 * Tenta baixar o catálogo se estiver online.
 * Offline: no-op, retorna o status atual.
 */
export async function pullCatalogIfOnline(): Promise<LocalCatalogStatus> {
  if (!mayUseNetwork()) {
    return getLocalCatalogStatus()
  }
  try {
    await syncAll()
  } catch {
    // best-effort
  }
  return getLocalCatalogStatus()
}

export function formatLastSync(iso: string | null): string {
  if (!iso) return 'nunca'
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  } catch {
    return '—'
  }
}
