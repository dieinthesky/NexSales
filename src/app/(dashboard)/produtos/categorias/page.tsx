import { CategoryManager } from './category-manager'
import { requireAdmin } from '@/lib/auth/roles'
import { listCategoriesForCurrentStore } from '@/lib/queries/categories'

export const dynamic = 'force-dynamic'

export default async function CategoriasPage() {
  const user = await requireAdmin()
  const categories = await listCategoriesForCurrentStore(user)

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Categorias
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Organize os produtos da sua loja (ex.: Alimentos, Bebidas, Limpeza).
        </p>
      </div>

      <CategoryManager initialCategories={categories} />
    </div>
  )
}
