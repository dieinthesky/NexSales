import { ClipboardList } from 'lucide-react'
import { requireAdmin } from '@/lib/auth/roles'
import { listCategoriesForCurrentStore } from '@/lib/queries/categories'
import { VisitaInventario } from '@/components/products/visita-inventario'

export default async function VisitaInventarioPage() {
  const user = await requireAdmin()
  const categories = await listCategoriesForCurrentStore(user)

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-slate-700 dark:text-slate-200" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Visita / Inventário
          </h1>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          No celular: bipe o código, cadastre se for novo e informe a quantidade em estoque.
          Grava no sistema na hora — o .exe do cliente puxa no sync.
        </p>
      </div>

      <VisitaInventario categories={categories} />
    </div>
  )
}
