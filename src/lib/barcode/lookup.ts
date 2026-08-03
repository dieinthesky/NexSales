/**
 * Barcode lookup module.
 *
 * Strategy:
 *   1. Check the application's own Supabase database (handled in the action layer)
 *   2. Cosmos (Bluesoft) — best Brazilian coverage; requires COSMOS_API_TOKEN
 *   3. Open Food Facts — food & beverages
 *   4. Open Products Facts — non-food (limpeza, utilidades…)
 *   5. Open Beauty Facts — cosmetics / personal care
 *   6. UPCitemdb — worldwide general (trial)
 *
 * Each external call is wrapped in a short timeout so the cadastro flow never hangs.
 */

const EXTERNAL_TIMEOUT_MS = 5_000

export type BarcodeSource =
  | 'cosmos'
  | 'openfoodfacts'
  | 'openproductsfacts'
  | 'openbeautyfacts'
  | 'upcitemdb'

export interface ExternalBarcodeResult {
  source: BarcodeSource
  name: string
  description: string | null
  imageUrl?: string | null
  /** Trecho de categoria das bases (ex.: Cosmos category) — para inferir Alimentos/Higiene… */
  categoryHint?: string | null
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
    categoryHint:
      data.category?.description ?? data.gpc?.description ?? null,
  }
}

/** Open Food / Products / Beauty Facts share the same API shape. */
async function lookupOpenFactsFamily(
  code: string,
  host: string,
  source: Extract<
    BarcodeSource,
    'openfoodfacts' | 'openproductsfacts' | 'openbeautyfacts'
  >,
): Promise<ExternalBarcodeResult | null> {
  const url = `https://${host}/api/v2/product/${encodeURIComponent(code)}.json`
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
    source,
    name: name.trim(),
    description: descriptionParts.length > 0 ? descriptionParts.join(' · ') : null,
    imageUrl: p.image_front_url || p.image_url || null,
    categoryHint: p.categories?.split(',')[0]?.trim() ?? null,
  }
}

async function lookupOpenFoodFacts(code: string) {
  return lookupOpenFactsFamily(code, 'world.openfoodfacts.org', 'openfoodfacts')
}

async function lookupOpenProductsFacts(code: string) {
  return lookupOpenFactsFamily(code, 'world.openproductsfacts.org', 'openproductsfacts')
}

async function lookupOpenBeautyFacts(code: string) {
  return lookupOpenFactsFamily(code, 'world.openbeautyfacts.org', 'openbeautyfacts')
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
    categoryHint: item.category ?? null,
  }
}

/**
 * Real barcodes (EAN-8, EAN-13, UPC-A, GTIN-14) are 8–14 purely numeric digits.
 * Anything else is a custom internal SKU and should not hit external APIs.
 */
function isLikelyBarcode(code: string): boolean {
  return /^\d{8,14}$/.test(code)
}

/** Free/open sources that complement Cosmos (food → non-food → beauty → general). */
async function lookupFreeExternalChain(
  code: string,
): Promise<ExternalBarcodeResult | null> {
  const fromOff = await lookupOpenFoodFacts(code)
  if (fromOff) return fromOff

  const fromOpf = await lookupOpenProductsFacts(code)
  if (fromOpf) return fromOpf

  const fromObf = await lookupOpenBeautyFacts(code)
  if (fromObf) return fromObf

  return lookupUpcItemDb(code)
}

/** First image found across free sources (used to enrich Cosmos/cache hits). */
async function lookupFreeExternalImage(code: string): Promise<string | null> {
  for (const lookup of [
    lookupOpenFoodFacts,
    lookupOpenProductsFacts,
    lookupOpenBeautyFacts,
    lookupUpcItemDb,
  ]) {
    const hit = await lookup(code)
    if (hit?.imageUrl) return hit.imageUrl
  }
  return null
}

/**
 * Try external barcode databases in order:
 *   Cosmos → Open Food Facts → Open Products Facts → Open Beauty Facts → UPCitemdb
 * Returns the first successful result, or null if nothing matched.
 *
 * Se o Cosmos achar o produto sem foto, ainda consulta as bases abertas só pela imagem.
 */
export async function lookupExternalBarcode(
  code: string,
): Promise<ExternalBarcodeResult | null> {
  const trimmed = code.trim()
  if (!trimmed || !isLikelyBarcode(trimmed)) return null

  const fromCosmos = await lookupCosmos(trimmed)
  if (fromCosmos) {
    if (!fromCosmos.imageUrl) {
      fromCosmos.imageUrl = await lookupFreeExternalImage(trimmed)
    }
    return fromCosmos
  }

  return lookupFreeExternalChain(trimmed)
}

/** Só a URL da foto nas bases abertas. Usado para enriquecer produto já cadastrado. */
export async function lookupExternalProductImage(
  code: string,
): Promise<string | null> {
  const trimmed = code.trim()
  if (!trimmed || !isLikelyBarcode(trimmed)) return null
  return lookupFreeExternalImage(trimmed)
}
