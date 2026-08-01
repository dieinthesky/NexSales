import { notFound } from 'next/navigation'
import { ProductForm } from '@/components/products/product-form'
import { ReactivateProductButton } from '@/components/products/reactivate-product-button'
import { updateProduct } from '../actions'
import { requireAdmin } from '@/lib/auth/roles'
import {
  canAccessStoreRow,
  getAdminDataClient,
  resolveAdminContext,
} from '@/lib/supabase/admin-data'
import { isElectron } from '@/lib/db/client'
import type { Category, Product } from '@/types/database'

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireAdmin()
  const { id } = await params
  const { role, storeId } = await resolveAdminContext(user)
  const client = await getAdminDataClient()

  let product: Product | null = null
  let categories: Category[] = []

  const [{ data: productRow }, { data: categoryRows }] = await Promise.all([
    client.from('products').select('*').eq('id', id).maybeSingle(),
    client
      .from('categories')
      .select('*')
      .order('name'),
  ])

  product = (productRow as Product | null) ?? null
  categories = (categoryRows as Category[] | null) ?? []

  if (!product && isElectron()) {
    try {
      const { getDb } = await import('@/lib/db/client')
      const db = getDb()
      const row = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined
      if (row) {
        product = {
          ...(row as unknown as Product),
          is_active: row.is_active === true || row.is_active === 1,
          track_stock: row.track_stock === true || row.track_stock === 1,
        }
      }
      if (categories.length === 0) {
        const { getCategories } = await import('@/lib/db/queries/products')
        categories = getCategories()
      }
    } catch {
      // ignore sqlite fallback errors
    }
  }

  if (!product) notFound()
  if (!canAccessStoreRow(role, storeId, product.store_id)) notFound()

  if (role !== 'master' && storeId) {
    categories = categories.filter((c) => c.store_id === storeId)
  }

  const action = updateProduct.bind(null, id)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            Editar Produto
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{product.name}</p>
          {!product.is_active && (
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-2">
              Este produto está desativado e não aparece no PDV.
            </p>
          )}
        </div>
        {!product.is_active && <ReactivateProductButton productId={product.id} />}
      </div>

      <ProductForm product={product} categories={categories} onSubmit={action} />
    </div>
  )
}
