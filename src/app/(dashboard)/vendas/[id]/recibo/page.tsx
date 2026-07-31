import { notFound } from 'next/navigation'
import { getSaleById } from '@/lib/queries/sales'
import { ReceiptView } from '@/components/sales/receipt-view'
import { requireAuth } from '@/lib/auth/roles'
import { toBRISO, todayBRISO } from '@/lib/utils/datetime'

export const metadata = {
  title: 'Recibo da venda',
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // requireAuth (não getUser) — no Electron o cookie offline precisa ser aceito
  const user = await requireAuth()

  const { id } = await params
  const sale = await getSaleById(id)
  if (!sale) notFound()

  if (user.role !== 'admin' && toBRISO(sale.created_at) !== todayBRISO()) {
    notFound()
  }

  return <ReceiptView sale={sale} />
}
