import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/roles'
import { getAdminDataClient, resolveAdminContext } from '@/lib/supabase/admin-data'
import type { Product } from '@/types/database'

/**
 * Busca de produto para o PDV (exe e site) quando o cache local falha.
 * GET /api/products/lookup?q=acebolada  or  ?code=789...
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || searchParams.get('code') || '').trim()
  if (!q || q.length < 1) {
    return NextResponse.json({ products: [] as Product[] })
  }

  const { storeId } = await resolveAdminContext(user)
  const supabase = await getAdminDataClient()

  const isCodeLike = /^[0-9A-Za-z._-]{4,}$/.test(q) && !q.includes(' ')

  let products: Product[] = []

  if (isCodeLike) {
    let query = supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .ilike('code', q)
      .limit(10)
    if (storeId) query = query.eq('store_id', storeId)
    const { data } = await query
    products = (data as Product[] | null) ?? []

    if (products.length === 0) {
      // um dígito errado é comum no bipe/digitação
      let soft = supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .ilike('code', `%${q.slice(0, Math.max(6, q.length - 2))}%`)
        .limit(20)
      if (storeId) soft = soft.eq('store_id', storeId)
      const { data: softData } = await soft
      const candidates = ((softData as Product[] | null) ?? []).filter(
        (p) => p.code && !p.code.startsWith('__'),
      )
      products = candidates.filter((p) => hammingClose(p.code, q, 2)).slice(0, 5)
    }
  }

  if (products.length === 0) {
    const safe = q.replace(/[%_,]/g, ' ').trim()
    let query = supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .or(`name.ilike.%${safe}%,code.ilike.%${safe}%`)
      .limit(20)
    if (storeId) query = query.eq('store_id', storeId)
    const { data } = await query
    products = ((data as Product[] | null) ?? []).filter(
      (p) => p.code && !p.code.startsWith('__'),
    )
  }

  return NextResponse.json({ products })
}

/** Distância em dígitos/chars ≤ maxDist e mesmo comprimento aproximado. */
function hammingClose(a: string, b: string, maxDist: number): boolean {
  if (!a || !b) return false
  if (Math.abs(a.length - b.length) > 1) return false
  const longer = a.length >= b.length ? a : b
  const shorter = a.length >= b.length ? b : a
  if (longer.length === shorter.length) {
    let d = 0
    for (let i = 0; i < longer.length; i++) {
      if (longer[i] !== shorter[i]) d++
      if (d > maxDist) return false
    }
    return true
  }
  // insertion/deletion of 1
  let i = 0
  let j = 0
  let d = 0
  while (i < longer.length && j < shorter.length) {
    if (longer[i] === shorter[j]) {
      i++
      j++
    } else {
      d++
      if (d > maxDist) return false
      i++
    }
  }
  d += longer.length - i + (shorter.length - j)
  return d <= maxDist
}
