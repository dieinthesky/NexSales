import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/roles'
import { isElectron } from '@/lib/db/client'
import { tryQuery } from '@/lib/supabase/try-query'
import { PDV } from './pdv'
import type { Product } from '@/types/database'
import type { StorePixConfig } from '@/components/sales/pix-qr-panel'

export const dynamic = 'force-dynamic'

/**
 * Nova Venda — tem que abrir em <2s mesmo offline no .exe.
 * Não espera Supabase: AVULSO/PIX são opcionais.
 */
export default async function NovaVendaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  let avulsoProduct: Product | null = null
  let pixConfig: StorePixConfig | null = null

  if (isElectron()) {
    // 1) SQLite local na hora
    try {
      const { getDb } = await import('@/lib/db/client')
      const db = getDb()
      const row = db
        .prepare(
          `SELECT * FROM products WHERE code = 'AVULSO' AND is_active = 1 LIMIT 1`,
        )
        .get() as Record<string, unknown> | undefined
      if (row) {
        avulsoProduct = {
          ...(row as unknown as Product),
          is_active: row.is_active === true || row.is_active === 1,
          track_stock: row.track_stock === true || row.track_stock === 1,
        }
      }
    } catch {
      // best-effort
    }

    // PIX offline: null (QR só com internet / cache se já carregado na sessão)
  } else {
    // Web: tenta nuvem com timeout curto
    const { data: cloudAvulso } = await tryQuery(async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('code', 'AVULSO')
        .eq('is_active', true)
        .maybeSingle()
      return (data as Product | null) ?? null
    }, null, 2_000)
    avulsoProduct = cloudAvulso

    if (user.storeId) {
      const { data: pix } = await tryQuery(
        async () => {
          const { loadPixConfigForStore } = await import('@/lib/store-pix')
          return loadPixConfigForStore(user.storeId!)
        },
        null,
        2_000,
      )
      pixConfig = pix
    }
  }

  return <PDV avulsoProduct={avulsoProduct} pixConfig={pixConfig} />
}
