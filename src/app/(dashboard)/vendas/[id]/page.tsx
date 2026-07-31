import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, CreditCard, FileText, Printer, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getSaleById } from '@/lib/queries/sales'
import { formatCurrency, formatDate, PAYMENT_LABELS } from '@/lib/utils/format'
import { getCurrentUser } from '@/lib/auth/roles'
import { shortSaleId } from '@/lib/utils/receipt'
import { CancelSaleButton } from '@/components/sales/cancel-sale-button'
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
    badge: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-1 ring-inset ring-blue-600/15 dark:ring-blue-500/20',
    dot: 'bg-blue-500',
  },
  debit: {
    badge: 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 ring-1 ring-inset ring-orange-600/15 dark:ring-orange-500/20',
    dot: 'bg-orange-500',
  },
  fiado: {
    badge: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-600/15 dark:ring-amber-500/20',
    dot: 'bg-amber-500',
  },
}

function PaymentBadge({ method }: { method: PaymentMethod }) {
  const style = PAYMENT_STYLES[method] ?? PAYMENT_STYLES.cash
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {PAYMENT_LABELS[method]}
    </span>
  )
}

export default async function VendaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [sale, currentUser] = await Promise.all([
    getSaleById(id),
    getCurrentUser(),
  ])

  if (!sale) notFound()

  const isAdminUser = currentUser?.role === 'admin'

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/8 -ml-2"
        >
          <Link href="/vendas">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Voltar
          </Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Detalhes da Venda</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{formatDate(sale.created_at)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdminUser && (
            <CancelSaleButton saleId={sale.id} shortId={shortSaleId(sale.id)} />
          )}
          <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm w-fit">
            <Link href={`/vendas/${sale.id}/recibo`}>
              <Printer className="mr-1.5 h-4 w-4" />
              Imprimir recibo
            </Link>
          </Button>
        </div>
      </div>

      <Card className="border-slate-200/80 dark:border-white/8 shadow-sm overflow-hidden dark:bg-slate-800/60">
        <CardHeader className="bg-slate-50/60 dark:bg-white/3 border-b border-slate-100 dark:border-white/5 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              Resumo
            </CardTitle>
            <PaymentBadge method={sale.payment_method as PaymentMethod} />
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-white/8 flex items-center justify-center shrink-0">
                <Calendar className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Data</p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                  {formatDate(sale.created_at)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-white/8 flex items-center justify-center shrink-0">
                <CreditCard className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Pagamento
                </p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                  {PAYMENT_LABELS[sale.payment_method as PaymentMethod] ?? sale.payment_method}
                </p>
              </div>
            </div>
            {sale.notes && (
              <div className="col-span-2 flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-white/8 flex items-center justify-center shrink-0">
                  <FileText className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Observações
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{sale.notes}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 dark:border-white/8 shadow-sm dark:bg-slate-800/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100">Itens da Venda</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 h-11 pl-6">
                  Produto
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-center">
                  Qtd
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-right">
                  Preço Unit.
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-right pr-6">
                  Subtotal
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sale.sale_items.map((item, idx) => (
                <TableRow
                  key={item.id}
                  className={`border-slate-100 dark:border-white/5 ${idx % 2 === 1 ? 'bg-slate-50/30 dark:bg-white/2' : ''}`}
                >
                  <TableCell className="pl-6">
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {item.products?.name ?? 'Produto'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                      {item.products?.code ?? '—'}
                    </p>
                  </TableCell>
                  <TableCell className="text-center font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                    {item.quantity}
                  </TableCell>
                  <TableCell className="text-right text-slate-500 dark:text-slate-400 tabular-nums">
                    {formatCurrency(item.unit_price)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-900 dark:text-slate-100 tabular-nums pr-6">
                    {formatCurrency(item.subtotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="border-t border-slate-100 dark:border-white/5 mx-6 my-0" />
          <div className="px-6 py-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Total da Venda</span>
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatCurrency(sale.total_amount)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
