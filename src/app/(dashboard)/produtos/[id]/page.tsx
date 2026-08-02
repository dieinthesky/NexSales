import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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
  const { role, storeId, storeIds } = await resolveAdminContext(user)

  let product: Product | null = null
  let categories: Category[] = []

  // 1) RLS do usuário (conta padrão / JWT válido) — se enxergar o produto, pode editar
  const userClient = await createClient()
  const [{ data: rlsProduct }, { data: rlsCategories }] = await Promise.all([
    userClient.from('products').select('*').eq('id', id).maybeSingle(),
    userClient.from('categories').select('*').order('name'),
  ])
  if (rlsProduct) product = rlsProduct as Product
  if (rlsCategories?.length) categories = rlsCategories as Category[]

  // 2) Service role / admin client (desktop offline ou JWT fraco)
  if (!product) {
    const client = await getAdminDataClient()
    const [{ data: productRow }, { data: categoryRows }] = await Promise.all([
      client.from('products').select('*').eq('id', id).maybeSingle(),
      client.from('categories').select('*').order('name'),
    ])
    product = (productRow as Product | null) ?? null
    if (!categories.length) {
      categories = (categoryRows as Category[] | null) ?? []
    }
    if (
      product &&
      !canAccessStoreRow(role, storeId, product.store_id, storeIds)
    ) {
      notFound()
    }
  }

  // 3) SQLite local (Electron)
  if (!product && isElectron()) {
    try {
      const { getDb } = await import('@/lib/db/client')
      const db = getDb()
      const row = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined
      if (row) {
        const mapped: Product = {
          ...(row as unknown as Product),
          is_active: row.is_active === true || row.is_active === 1,
          track_stock: row.track_stock === true || row.track_stock === 1,
        }
        if (canAccessStoreRow(role, storeId, mapped.store_id, storeIds) || !storeId) {
          // Sem storeId resolvido: confia no cache local (já filtrado no sync da loja)
          product = mapped
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

  if (role !== 'master' && storeId) {
    categories = categories.filter((c) => !c.store_id || c.store_id === storeId)
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
