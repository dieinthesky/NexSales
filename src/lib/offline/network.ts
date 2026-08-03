/**
 * Sinal de rede para o PDV — coarse, mas suficiente para não disparar fetch
 * quando o OS já disse offline.
 */
import 'client-only'

export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

/** PDV só usa rede se online; se offline, zero fetch de catálogo. */
export function mayUseNetwork(): boolean {
  return isBrowserOnline()
}
