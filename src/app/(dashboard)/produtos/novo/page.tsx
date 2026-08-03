import { createClient } from '@/lib/supabase/server'
import { ProductForm } from '@/components/products/product-form'
import { createProduct } from '../actions'
import { requireAdmin } from '@/lib/auth/roles'
import {
  getAdminDataClient,
  resolveAdminContext,
} from '@/lib/supabase/admin-data'
import type { Category } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function NovoProdutoPage() {
  const user = await requireAdmin()
  const { role, storeId } = await resolveAdminContext(user)

  let categories: Category[] = []

  const userClient = await createClient()
  const { data: rlsCats } = await userClient
    .from('categories')
    .select('*')
    .order('name')
  if (rlsCats?.length) categories = rlsCats as Category[]

  if (!categories.length) {
    try {
      const admin = await getAdminDataClient()
      const { data: adminCats } = await admin
        .from('categories')
        .select('*')
        .order('name')
      categories = (adminCats as Category[] | null) ?? []
    } catch {
      // keep empty
    }
  }

  if (role !== 'master' && storeId) {
    categories = categories.filter((c) => !c.store_id || c.store_id === storeId)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
          Novo Produto
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Código, nome e preço de venda. Use nomes claros (ex.: Coca-Cola 2L), como na prateleira.
        </p>
      </div>

      <ProductForm categories={categories} onSubmit={createProduct} />
    </div>
  )
}
