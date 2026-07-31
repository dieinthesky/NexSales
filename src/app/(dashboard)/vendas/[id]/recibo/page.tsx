import { notFound } from 'next/navigation'
import { getSaleById } from '@/lib/queries/sales'
import { ReceiptView } from '@/components/sales/receipt-view'
import { requireAuth } from '@/lib/auth/roles'

export const metadata = {
  title: 'Recibo da venda',
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // requireAuth (não getUser) — no Electron o cookie offline precisa ser aceito
  await requireAuth()

  const { id } = await params
  const sale = await getSaleById(id)
  if (!sale) notFound()

  return <ReceiptView sale={sale} />
}
