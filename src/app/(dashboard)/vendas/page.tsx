import Link from 'next/link'
import { Plus, Printer, ShoppingCart, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { SalesFilters } from '@/components/sales/sales-filters'
import { getSalesPaged } from '@/lib/queries/sales'
import { getCurrentUser } from '@/lib/auth/roles'
import { tryQuery } from '@/lib/supabase/try-query'
import { OfflineBanner } from '@/components/offline/offline-banner'
import { todayBRISO } from '@/lib/utils/datetime'
import { formatCurrency, formatDate, PAYMENT_LABELS } from '@/lib/utils/format'
import type { PaymentMethod } from '@/types/database'

type PaymentStyle = { badge: string; dot: string }

const PAYMENT_STYLES: Record<PaymentMethod, PaymentStyle> = {
  cash: {
    badge: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-600/15 dark:ring-green-500/20',
    dot: 'bg-green-500',
  },
  pix: {
    badge: 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 ring-1 ring-inset ring-purple-600/15 dark:ring-purple-500/20',
    dot: 'bg-purple-500',
  },
  credit: {
    badge: 'bg-primary/5 dark:bg-primary/10 text-primary/80 dark:text-primary/90 ring-1 ring-inset ring-primary/20',
    dot: 'bg-primary/90',
  },
  debit: {
    badge: 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 ring-1 ring-inset ring-orange-600/15 dark:ring-orange-500/20',
    dot: 'bg-orange-500',
  },
  fiado: {
    badge: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-600/15 dark:ring-amber-500/20',
    dot: 'bg-amber-500',
  },
  mixed: {
    badge: 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 ring-1 ring-inset ring-teal-600/15 dark:ring-teal-500/20',
    dot: 'bg-teal-500',
  },
}

function PaymentBadge({ method }: { method: PaymentMethod }) {
  const style = PAYMENT_STYLES[method] ?? PAYMENT_STYLES.cash
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium tabular-nums ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {PAYMENT_LABELS[method]}
    </span>
  )
}

function parsePayment(value: string | undefined): PaymentMethod | undefined {
  if (value === 'cash' || value === 'pix' || value === 'credit' || value === 'debit' || value === 'fiado') {
    return value
  }
  return undefined
}

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

interface VendasSearchParams {
  payment?: string
  day?: string
  page?: string
}

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<VendasSearchParams>
}) {
  const sp = await searchParams
  const payment = parsePayment(sp.payment)
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1

  // Funcionário só enxerga as vendas de HOJE — sem acesso ao histórico antigo.
  // A trava é no servidor: mesmo que ele force ?day=2026-01-01 na URL, aqui
  // sobrescrevemos para o dia de hoje (BRT). Admin vê o histórico completo.
  const user = await getCurrentUser()
  const isEmployee = user?.role !== 'admin' && user?.role !== 'master'
  const day = isEmployee
    ? todayBRISO()
    : isIsoDate(sp.day)
      ? sp.day
      : undefined

  const EMPTY_SALES = { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }
  const { data: salesResult, offline } = await tryQuery(
    () => getSalesPaged({ payment, day, page }),
    EMPTY_SALES,
  )
  const { items: sales, total, totalPages, pageSize } = salesResult

  // Para o funcionário, "hoje" é o estado normal, não um filtro que ele aplicou.
  const hasFilters = Boolean(payment || (!isEmployee && day))

  const paginationParams: Record<string, string | undefined> = {
    payment,
    day,
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      {offline && (
        <OfflineBanner message="Sem conexão — histórico de vendas indisponível offline." />
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            {isEmployee ? 'Vendas de hoje' : 'Vendas'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {total} {total === 1 ? 'venda registrada' : 'vendas registradas'}
            {isEmployee ? ' hoje' : hasFilters ? ' (com filtros aplicados)' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            variant="outline"
            className="border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
          >
            <Link href="/vendas/fechamento">
              <Wallet className="mr-1.5 h-4 w-4" />
              Fechar caixa
            </Link>
          </Button>
          <Button asChild className="bg-green-600 hover:bg-green-700 text-white shadow-sm">
            <Link href="/vendas/nova">
              <Plus className="mr-1.5 h-4 w-4" />
              Nova Venda
            </Link>
          </Button>
        </div>
      </div>

      <Card className="flex flex-col flex-1 min-h-0 border-slate-200/80 dark:border-white/8 shadow-sm dark:bg-slate-800/60">
        <SalesFilters
          payment={payment ?? ''}
          day={day ?? ''}
          hasFilters={hasFilters}
          lockedDay={isEmployee}
        />

        <div className="flex-1 overflow-auto min-h-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 h-11">
                  Data
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-right">
                  Total
                </TableHead>
                <TableHead className="hidden sm:table-cell text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Pagamento
                </TableHead>
                <TableHead className="hidden md:table-cell text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Observações
                </TableHead>
                <TableHead className="w-24 sm:w-32 text-right pr-3 sm:pr-6 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="text-center py-16">
                    <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                      <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center">
                        <ShoppingCart className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                      </div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-1">
                        {hasFilters ? 'Nenhuma venda encontrada' : 'Nenhuma venda registrada'}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {hasFilters
                          ? 'Tente ajustar os filtros.'
                          : 'Registre sua primeira venda clicando em Nova Venda.'}
                      </p>
                      {!hasFilters && (
                        <Button asChild size="sm" className="mt-2 bg-green-600 hover:bg-green-700">
                          <Link href="/vendas/nova">
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Nova Venda
                          </Link>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sales.map((sale, idx) => (
                  <TableRow
                    key={sale.id}
                    className={`border-slate-100 dark:border-white/5 hover:bg-slate-50/70 dark:hover:bg-white/5 transition-colors ${
                      idx % 2 === 1 ? 'bg-slate-50/30 dark:bg-white/2' : ''
                    }`}
                  >
                    <TableCell className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
                      <div>{formatDate(sale.created_at)}</div>
                      <div className="sm:hidden mt-1">
                        <PaymentBadge method={sale.payment_method as PaymentMethod} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {formatCurrency(sale.total_amount)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <PaymentBadge method={sale.payment_method as PaymentMethod} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-slate-500 dark:text-slate-400 truncate max-w-xs">
                      {sale.notes || <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </TableCell>
                    <TableCell className="text-right pr-3 sm:pr-6">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/8"
                          title="Ver detalhes"
                        >
                          <Link href={`/vendas/${sale.id}`}>Ver</Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="text-slate-600 dark:text-slate-400 hover:text-primary/80 hover:bg-primary/5"
                          title="Imprimir recibo"
                        >
                          <Link href={`/vendas/${sale.id}/recibo`}>
                            <Printer className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination
          basePath="/vendas"
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
