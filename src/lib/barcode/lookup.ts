/**
 * Barcode lookup module.
 *
 * Strategy:
 *   1. Check the application's own Supabase database (handled in the action layer)
 *   2. Fall back to Cosmos (Bluesoft) — best Brazilian coverage; requires COSMOS_API_TOKEN
 *   3. Fall back to Open Food Facts — free, no key, but mostly food/cosmetics
 *
 * Each external call is wrapped in a short timeout so the cadastro flow never hangs.
 */

const EXTERNAL_TIMEOUT_MS = 5_000

export type BarcodeSource = 'cosmos' | 'openfoodfacts' | 'upcitemdb'

export interface ExternalBarcodeResult {
  source: BarcodeSource
  name: string
  description: string | null
  imageUrl?: string | null
}

interface CosmosResponse {
  description?: string
  brand?: { name?: string }
  gpc?: { description?: string }
  category?: { description?: string }
  thumbnail?: string
  image?: string
}

interface OffProduct {
  product_name?: string
  product_name_pt?: string
  generic_name?: string
  generic_name_pt?: string
  brands?: string
  categories?: string
  image_front_url?: string
  image_url?: string
}

interface OffResponse {
  status?: number
  product?: OffProduct
}

interface UpcItem {
  title?: string
  description?: string
  brand?: string
  category?: string
  images?: string[]
}

interface UpcResponse {
  code?: string
  total?: number
  items?: UpcItem[]
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    return res
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function lookupCosmos(code: string): Promise<ExternalBarcodeResult | null> {
  const token = process.env.COSMOS_API_TOKEN
  if (!token) return null

  const url = `https://api.cosmos.bluesoft.com.br/gtins/${encodeURIComponent(code)}.json`
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        'X-Cosmos-Token': token,
        'User-Agent': 'caixadobairro/1.0',
        Accept: 'application/json',
      },
    },
    EXTERNAL_TIMEOUT_MS,
  )

  if (!res || !res.ok) return null

  const data = (await res.json().catch(() => null)) as CosmosResponse | null
  if (!data?.description) return null

  // Prefer category (specific, e.g. "Refrigerantes Pet") over gpc (broad, e.g. "Bebidas").
  // Skip NCM — it's a fiscal classification, far too verbose for a product description.
  const segment = data.category?.description ?? data.gpc?.description
  const descriptionParts = [data.brand?.name, segment].filter(Boolean)

  return {
    source: 'cosmos',
    name: data.description.trim(),
    description: descriptionParts.length > 0 ? descriptionParts.join(' · ') : null,
    imageUrl: data.thumbnail || data.image || null,
  }
}

async function lookupOpenFoodFacts(
  code: string,
): Promise<ExternalBarcodeResult | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`
  const res = await fetchWithTimeout(
    url,
    { headers: { Accept: 'application/json', 'User-Agent': 'caixadobairro/1.0' } },
    EXTERNAL_TIMEOUT_MS,
  )

  if (!res || !res.ok) return null

  const data = (await res.json().catch(() => null)) as OffResponse | null
  if (!data || data.status !== 1 || !data.product) return null

  const p = data.product
  const name = p.product_name_pt || p.product_name || p.generic_name_pt || p.generic_name
  if (!name?.trim()) return null

  const descriptionParts = [p.brands, p.categories?.split(',')[0]?.trim()].filter(Boolean)

  return {
    source: 'openfoodfacts',
    name: name.trim(),
    description: descriptionParts.length > 0 ? descriptionParts.join(' · ') : null,
    imageUrl: p.image_front_url || p.image_url || null,
  }
}

async function lookupUpcItemDb(code: string): Promise<ExternalBarcodeResult | null> {
  // Trial endpoint — no API key required, ~100 req/day per IP
  const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`
  const res = await fetchWithTimeout(
    url,
    { headers: { Accept: 'application/json', 'User-Agent': 'caixadobairro/1.0' } },
    EXTERNAL_TIMEOUT_MS,
  )

  if (!res || !res.ok) return null

  const data = (await res.json().catch(() => null)) as UpcResponse | null
  const item = data?.items?.[0]
  if (!item?.title?.trim()) return null

  const descriptionParts = [item.brand, item.category].filter(
    (v): v is string => Boolean(v && v.trim()),
  )

  return {
    source: 'upcitemdb',
    name: item.title.trim(),
    description: descriptionParts.length > 0 ? descriptionParts.join(' · ') : null,
    imageUrl: item.images?.[0] || null,
  }
}

/**
 * Real barcodes (EAN-8, EAN-13, UPC-A, GTIN-14) are 8–14 purely numeric digits.
 * Anything else is a custom internal SKU and should not hit external APIs.
 */
function isLikelyBarcode(code: string): boolean {
  return /^\d{8,14}$/.test(code)
}

/**
 * Try external barcode databases in order:
 *   Cosmos (Brazil) → Open Food Facts (worldwide, food) → UPCitemdb (worldwide, general)
 * Returns the first successful result, or null if nothing matched.
 */
export async function lookupExternalBarcode(
  code: string,
): Promise<ExternalBarcodeResult | null> {
  const trimmed = code.trim()
  if (!trimmed || !isLikelyBarcode(trimmed)) return null

  const fromCosmos = await lookupCosmos(trimmed)
  if (fromCosmos) return fromCosmos

  const fromOff = await lookupOpenFoodFacts(trimmed)
  if (fromOff) return fromOff

  const fromUpc = await lookupUpcItemDb(trimmed)
  if (fromUpc) return fromUpc

  return null
}
