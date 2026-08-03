import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import { isPixConfigured } from '@/lib/utils/pix-brcode'
import type { StorePixConfig } from '@/components/sales/pix-qr-panel'
import { PDV } from './pdv'

export default async function NovaVendaPage() {
  // getCurrentUser() has a 3s abort timeout and falls back to the
  // nx-offline-session cookie, so the PDV stays accessible when offline.
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: avulsoProduct } = await supabase
    .from('products')
    .select('*')
    .eq('code', 'AVULSO')
    .eq('is_active', true)
    .maybeSingle()
    .then((r) => r, () => ({ data: null }))

  let pixConfig: StorePixConfig | null = null
  if (user.storeId) {
    const { data: store } = await supabase
      .from('stores')
      .select('name, pix_key, pix_merchant_name, pix_merchant_city')
      .eq('id', user.storeId)
      .maybeSingle()
      .then((r) => r, () => ({ data: null }))

    const row = store as {
      name?: string
      pix_key?: string | null
      pix_merchant_name?: string | null
      pix_merchant_city?: string | null
    } | null

    if (row && isPixConfigured(row.pix_key)) {
      pixConfig = {
        key: row.pix_key!.trim(),
        merchantName: (row.pix_merchant_name || row.name || 'CAIXA DO BAIRRO').trim(),
        merchantCity: (row.pix_merchant_city || undefined)?.trim(),
      }
    }
  }

  return <PDV avulsoProduct={avulsoProduct ?? null} pixConfig={pixConfig} />
}
