import Link from 'next/link'
import { Plus, Package, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { ProductActions } from '@/components/products/product-actions'
import { EnrichCatalogButton } from '@/components/products/enrich-catalog-button'
import { ApplySheetNamesButton } from '@/components/products/apply-sheet-names-button'
import { getCategories, getProductsPaged, getInventoryValuation, type StockFilter } from '@/lib/queries/products'
import { formatCurrency } from '@/lib/utils/format'
import { requireAdmin } from '@/lib/auth/roles'
import { tryQuery } from '@/lib/supabase/try-query'
import { OfflineBanner } from '@/components/offline/offline-banner'

/** Lista sempre fresca após cadastro (evita cache do Next no Vercel). */
export const dynamic = 'force-dynamic'

type StockStatus = 'out' | 'low' | 'ok'

function getStockStatus(stock: number, min: number): StockStatus {
  if (stock <= 0) return 'out'
  if (stock <= min) return 'low'
  return 'ok'
}

function StockBadge({ status, quantity, min, tracked }: { status: StockStatus; quantity: number; min: number; tracked: boolean }) {
  if (!tracked) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 ring-1 ring-inset ring-slate-200 dark:ring-slate-600/40">
        Livre
      </span>
    )
  }
  const styles: Record<StockStatus, string> = {
    out: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-600/15 dark:ring-red-500/20',
    low: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-500/20',
    ok: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-600/15 dark:ring-green-500/20',
  }
  const dotStyles: Record<StockStatus, string> = {
    out: 'bg-red-500',
    low: 'bg-amber-500',
    ok: 'bg-green-500',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium tabular-nums ${styles[status]}`}
      title={`Estoque mínimo: ${min}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[status]}`} />
      {quantity} un
    </span>
  )
}

function computeMargin(sale: number, cost: number): { pct: number; absolute: number } | null {
  if (!sale || sale <= 0) return null
  const absolute = sale - cost
  const pct = (absolute / sale) * 100
  return { pct, absolute }
}

function parseStockFilter(value: string | undefined): StockFilter {
  if (value === 'ok' || value === 'low' || value === 'out') return value
  return 'all'
}

const STOCK_LABELS: Record<Exclude<StockFilter, 'all'>, string> = {
  ok: 'Em estoque',
  low: 'Estoque baixo',
  out: 'Sem estoque',
}

interface ProdutosSearchParams {
  q?: string
  category?: string
  stock?: string
  page?: string
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<ProdutosSearchParams>
}) {
  await requireAdmin()
  const sp = await searchParams
  const search = sp.q?.trim() || undefined
  const categoryId = sp.category || undefined
  const stock = parseStockFilter(sp.stock)
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1

  const EMPTY_PRODUCTS = { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }
  const EMPTY_VALUATION = {
    productCount: 0,
    unitsInStock: 0,
    potentialRevenue: 0,
    investedAtCost: 0,
    potentialGrossProfit: 0,
    missingCostCount: 0,
  }
  const [
    { data: productsResult, offline },
    { data: categories },
    { data: valuation },
  ] = await Promise.all([
    tryQuery(() => getProductsPaged({ search, categoryId, stock, page }), EMPTY_PRODUCTS),
    tryQuery(() => getCategories(), []),
    tryQuery(() => getInventoryValuation(), EMPTY_VALUATION),
  ])
  const { items: products, total, totalPages, pageSize } = productsResult

  const paginationParams: Record<string, string | undefined> = {
    q: search,
    category: categoryId,
    stock: stock === 'all' ? undefined : stock,
  }

  return (
    <div className="space-y-6">
      {offline && (
        <OfflineBanner message="Sem conexão — lista de produtos indisponível. Use o PDV para consultar produtos pelo catálogo offline." />
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Produtos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {total} {total === 1 ? 'produto cadastrado' : 'produtos cadastrados'}
            {search ? ` para "${search}"` : ''}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
          <ApplySheetNamesButton auto />
          <EnrichCatalogButton />
          <Button asChild className="bg-primary hover:bg-primary/90 text-white shadow-sm">
            <Link href="/produtos/novo">
              <Plus className="mr-1.5 h-4 w-4" />
              Novo Produto
            </Link>
          </Button>
        </div>
      </div>

      {!search && !categoryId && stock === 'all' && valuation.productCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Se vender tudo (preço de venda)
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(valuation.potentialRevenue)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {valuation.unitsInStock} un em estoque
            </p>
          </Card>
          <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Valor investido (custo × estoque)
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(valuation.investedAtCost)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {valuation.missingCostCount > 0
                ? `${valuation.missingCostCount} produtos sem custo — preencha a coluna Custo`
                : 'Todos com custo cadastrado'}
            </p>
          </Card>
          <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Lucro bruto potencial
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {valuation.missingCostCount >= valuation.productCount && valuation.investedAtCost <= 0
                ? '—'
                : formatCurrency(valuation.potentialGrossProfit)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {valuation.missingCostCount >= valuation.productCount && valuation.investedAtCost <= 0
                ? 'Cadastre o custo dos produtos para estimar o lucro'
                : 'Venda potencial − custo em estoque'}
            </p>
          </Card>
        </div>
      )}

      <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm">
        {/* Filters bar */}
        <form className="p-4 border-b border-slate-100 dark:border-white/5 grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-5 relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              name="q"
              defaultValue={search}
              placeholder="Buscar por nome ou código..."
              className="w-full h-10 pl-9 pr-3 border border-slate-200 dark:border-white/10 rounded-md text-sm bg-white dark:bg-slate-800/60 text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            />
          </div>

          <select
            name="category"
            defaultValue={categoryId ?? ''}
            className="sm:col-span-3 h-10 px-3 border border-slate-200 dark:border-white/10 rounded-md text-sm bg-white dark:bg-slate-800/60 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            aria-label="Categoria"
          >
            <option value="">Todas as categorias</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <select
            name="stock"
            defaultValue={stock === 'all' ? '' : stock}
            className="sm:col-span-2 h-10 px-3 border border-slate-200 dark:border-white/10 rounded-md text-sm bg-white dark:bg-slate-800/60 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            aria-label="Status do estoque"
          >
            <option value="">Todos</option>
            <option value="ok">{STOCK_LABELS.ok}</option>
            <option value="low">{STOCK_LABELS.low}</option>
            <option value="out">{STOCK_LABELS.out}</option>
          </select>

          <div className="sm:col-span-2 flex gap-2">
            <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-white">
              Filtrar
            </Button>
            {(search || categoryId || stock !== 'all') && (
              <Button
                type="button"
                asChild
                variant="outline"
                className="border-slate-200 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5 px-3"
                title="Limpar filtros"
              >
                <Link href="/produtos">×</Link>
              </Button>
            )}
          </div>
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                <TableHead className="hidden sm:table-cell text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 h-11">
                  Código
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Produto
                </TableHead>
                <TableHead className="hidden md:table-cell text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Categoria
                </TableHead>
                <TableHead className="hidden lg:table-cell text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-right">
                  Custo
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-right">
                  Venda
                </TableHead>
                <TableHead className="hidden lg:table-cell text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-right">
                  Margem
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-center">
                  Estoque
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="text-center py-16">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-white/8 flex items-center justify-center">
                        <Package className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                      </div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-1">
                        Nenhum produto encontrado
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {search || categoryId || stock !== 'all'
                          ? 'Tente ajustar os filtros ou cadastre um novo produto.'
                          : 'Comece cadastrando seu primeiro produto.'}
                      </p>
                      <Button asChild size="sm" className="mt-2 bg-primary hover:bg-primary/90">
                        <Link href="/produtos/novo">
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          Cadastrar produto
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product, idx) => {
                  const status = getStockStatus(product.stock_quantity, product.min_stock)
                  const margin = computeMargin(product.sale_price, product.cost_price)

                  return (
                    <TableRow
                      key={product.id}
                      className={`border-slate-100 dark:border-white/5 hover:bg-slate-50/70 dark:hover:bg-white/5 transition-colors ${
                        idx % 2 === 1 ? 'bg-slate-50/30 dark:bg-white/2' : ''
                      }`}
                    >
                      <TableCell className="hidden sm:table-cell font-mono text-xs text-slate-500 dark:text-slate-400">
                        {product.code}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                        {product.name}
                        <span className="sm:hidden block font-mono text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                          {product.code}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {product.categories ? (
                          <Badge
                            variant="secondary"
                            className="bg-slate-100 dark:bg-white/8 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/8 font-normal"
                          >
                            {product.categories.name}
                          </Badge>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatCurrency(product.cost_price)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatCurrency(product.sale_price)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right tabular-nums">
                        {margin ? (
                          <span
                            className={
                              margin.pct >= 30
                                ? 'text-green-700 dark:text-green-400 font-medium'
                                : margin.pct >= 10
                                  ? 'text-slate-700 dark:text-slate-300'
                                  : 'text-red-600 dark:text-red-400 font-medium'
                            }
                          >
                            {margin.pct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <StockBadge
                          status={status}
                          quantity={product.stock_quantity}
                          min={product.min_stock}
                          tracked={product.track_stock ?? true}
                        />
                      </TableCell>
                      <TableCell>
                        <ProductActions
                          productId={product.id}
                          productName={product.name}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination
          basePath="/produtos"
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          searchParams={paginationParams}
        />
      </Card>
    </div>
  )
}
