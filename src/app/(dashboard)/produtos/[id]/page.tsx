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
import { listCategoriesForCurrentStore } from '@/lib/queries/categories'
import { isElectron } from '@/lib/db/client'
import type { Product } from '@/types/database'

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireAdmin()
  const { id } = await params
  const { role, storeId, storeIds } = await resolveAdminContext(user)

  let product: Product | null = null

  // 1) RLS do usuário
  const userClient = await createClient()
  const { data: rlsProduct } = await userClient
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (rlsProduct) product = rlsProduct as Product

  // 2) Service role / admin client
  if (!product) {
    const client = await getAdminDataClient()
    const { data: productRow } = await client
      .from('products')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    product = (productRow as Product | null) ?? null
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
          product = mapped
        }
      }
    } catch {
      // ignore
    }
  }

  if (!product) notFound()

  // Cura categorias da loja + lista legível (não mostra UUID)
  const categories = await listCategoriesForCurrentStore(user)

  // Se o produto ainda apontar para id órfão, limpa no form após heal
  const known = new Set(categories.map((c) => c.id))
  if (product.category_id && !known.has(product.category_id)) {
    product = { ...product, category_id: null }
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
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/produtos/${id}/etiqueta`}
            className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Etiqueta de prateleira
          </a>
          {!product.is_active && <ReactivateProductButton productId={product.id} />}
        </div>
      </div>

      <ProductForm product={product} categories={categories} onSubmit={action} />
    </div>
  )
}
