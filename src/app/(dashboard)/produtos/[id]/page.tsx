import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProductForm } from '@/components/products/product-form'
import { ReactivateProductButton } from '@/components/products/reactivate-product-button'
import { updateProduct } from '../actions'
import { requireAdmin } from '@/lib/auth/roles'

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const supabase = await createClient()

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).single(),
    supabase.from('categories').select('*').order('name'),
  ])

  if (!product) notFound()

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

      <ProductForm product={product} categories={categories ?? []} onSubmit={action} />
    </div>
  )
}
