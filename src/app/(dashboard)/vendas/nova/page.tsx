import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
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

  return <PDV avulsoProduct={avulsoProduct ?? null} />
}
