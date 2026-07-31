/**
 * Timezone-aware datetime helpers — everything operator-facing must be in
 * BRT (America/Sao_Paulo) regardless of where the code runs.
 *
 * Why this exists: the app runs on Vercel, where Node's local time is UTC.
 * A sale created at 22:00 in São Paulo is stored as 2026-06-09T01:00:00Z.
 * If we format that with bare `format()` or `toLocaleDateString()` on the
 * server we get "09/06" — but the cashier just rang it up on the 8th.
 * Using these helpers everywhere keeps the "day" the operator sees aligned
 * with the operator's wall clock.
 */

export const BR_TZ = 'America/Sao_Paulo'

/** Day + month formatted as "dd/MM" in BRT, regardless of server TZ. */
export function formatBRDayMonth(date: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: BR_TZ,
    day: '2-digit',
    month: '2-digit',
  }).format(typeof date === 'string' ? new Date(date) : date)
}

/** "dd/MM/yyyy às HH:mm" in BRT. Used in lists/details. */
export function formatBRDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BR_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('day')}/${get('month')}/${get('year')} às ${get('hour')}:${get('minute')}`
}

/**
 * Today's date in BRT as an ISO YYYY-MM-DD string.
 *
 * Used as the default for the cash-close "date" param. Without TZ-awareness,
 * an operator opening the page at 21:30 (BRT) on the 8th would see the 9th's
 * report because the server (UTC) already thinks it's tomorrow.
 */
export function todayBRISO(): string {
  return toBRISO(new Date())
}

/** Calendar day (YYYY-MM-DD) of an instant in BRT. */
export function toBRISO(date: Date | string): string {
  // en-CA formats as YYYY-MM-DD, which is exactly what we want.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof date === 'string' ? new Date(date) : date)
}

/**
 * For a local-day string ("2026-06-08"), return the UTC ISO timestamps that
 * mark 00:00:00.000 and 23:59:59.999 of that day in São Paulo. Used to build
 * `gte`/`lte` filters against `created_at` (stored as UTC).
 *
 * Approach: we don't need to deal with DST because Brazil dropped it in 2019
 * — BRT is a fixed UTC-3 year-round. We add 3h to the wall-clock midnight to
 * get UTC. If Brazil ever brings DST back, swap this for date-fns-tz.
 */
export function brDayRangeUTC(localDate: string): { start: string; end: string } {
  // localDate is "YYYY-MM-DD"; appending the offset makes it a real UTC instant.
  const start = new Date(`${localDate}T00:00:00-03:00`).toISOString()
  const end = new Date(`${localDate}T23:59:59.999-03:00`).toISOString()
  return { start, end }
}
