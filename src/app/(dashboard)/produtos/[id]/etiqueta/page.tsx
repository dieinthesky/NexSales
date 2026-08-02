import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/roles'
import {
  canAccessStoreRow,
  getAdminDataClient,
  resolveAdminContext,
} from '@/lib/supabase/admin-data'
import { ProductLabelPrint, type LabelProduct } from '@/components/products/product-label-print'
import type { Product } from '@/types/database'

export const metadata = {
  title: 'Etiqueta do produto',
}

export default async function ProductLabelPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireAdmin()
  const { role, storeId, storeIds } = await resolveAdminContext(user)

  let product: Product | null = null
  let storeName: string | undefined

  const userClient = await createClient()
  const { data: rlsProduct } = await userClient
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (rlsProduct) product = rlsProduct as Product

  if (!product) {
    const client = await getAdminDataClient()
    const { data } = await client.from('products').select('*').eq('id', id).maybeSingle()
    product = (data as Product | null) ?? null
    if (
      product &&
      !canAccessStoreRow(role, storeId, product.store_id, storeIds)
    ) {
      notFound()
    }
  }

  if (!product) notFound()

  if (product.store_id) {
    const { data: store } = await userClient
      .from('stores')
      .select('name')
      .eq('id', product.store_id)
      .maybeSingle()
    storeName = (store as { name?: string } | null)?.name
  }

  const label: LabelProduct = {
    id: product.id,
    name: product.name,
    code: product.code,
    sale_price: product.sale_price,
    storeName,
  }

  return (
    <div className="space-y-3">
      <Link
        href={`/produtos/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 print:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao produto
      </Link>
      <ProductLabelPrint product={label} />
    </div>
  )
}
