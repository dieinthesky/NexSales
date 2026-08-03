import { ProductForm } from '@/components/products/product-form'
import { createProduct } from '../actions'
import { requireAdmin } from '@/lib/auth/roles'
import { listCategoriesForCurrentStore } from '@/lib/queries/categories'

export const dynamic = 'force-dynamic'

export default async function NovoProdutoPage() {
  const user = await requireAdmin()
  const categories = await listCategoriesForCurrentStore(user)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
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
