import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Receipt } from 'lucide-react'
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
import { getCustomerDetails } from '@/lib/queries/customers'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { DebtPaymentForm } from './debt-payment-form'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClienteDetalhePage({ params }: Props) {
  const { id } = await params
  const details = await getCustomerDetails(id)

  if (!details) notFound()

  const { customer, fiadoSales, debtPayments, totalFiado, totalPaid, currentDebt } = details

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/8 -ml-2"
        >
          <Link href="/clientes">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Clientes
          </Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            {customer.full_name}
          </h1>
          {customer.phone && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{customer.phone}</p>
          )}
        </div>
        <DebtPaymentForm customerId={customer.id} customerName={customer.full_name} totalDebt={currentDebt} />
      </div>

      {/* Resumo do saldo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total fiado</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-1">
              {formatCurrency(totalFiado)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-emerald-100 dark:border-emerald-500/20 dark:bg-slate-800/60 shadow-sm">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total pago</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
              {formatCurrency(totalPaid)}
            </p>
          </CardContent>
        </Card>
        <Card className={
          currentDebt > 0
            ? 'border-red-200 dark:border-red-500/20 dark:bg-slate-800/60 shadow-sm'
            : currentDebt < 0
              ? 'border-emerald-100 dark:border-emerald-500/20 dark:bg-slate-800/60 shadow-sm'
              : 'border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm'
        }>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {currentDebt < 0 ? 'Crédito do cliente' : 'Saldo devedor'}
            </p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${
              currentDebt > 0
                ? 'text-red-600 dark:text-red-400'
                : currentDebt < 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-900 dark:text-slate-100'
            }`}>
              {formatCurrency(Math.abs(currentDebt))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Compras fiadas */}
      <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Receipt className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Compras fiadas ({fiadoSales.length})
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 h-10">
                  Data
                </TableHead>
                <TableHead className="hidden sm:table-cell text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Itens
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-right">
                  Total
                </TableHead>
                <TableHead className="w-20 text-right pr-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Recibo
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fiadoSales.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="text-center py-8 text-sm text-slate-400 dark:text-slate-500">
                    Nenhuma compra fiada registrada.
                  </TableCell>
                </TableRow>
              ) : (
                fiadoSales.map((sale) => (
                  <TableRow key={sale.id} className="border-slate-100 dark:border-white/5 hover:bg-slate-50/70 dark:hover:bg-white/5">
                    <TableCell className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
                      {formatDate(sale.created_at)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate">
                      {sale.sale_items.map((i) => `${i.quantity}× ${i.products?.name ?? 'Produto'}`).join(', ')}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(sale.total_amount)}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-primary hover:bg-blue-50 dark:hover:bg-primary/10"
                      >
                        <Link href={`/vendas/${sale.id}/recibo`}>Ver</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Pagamentos recebidos */}
      {debtPayments.length > 0 && (
        <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Pagamentos recebidos ({debtPayments.length})
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 h-10">
                    Data
                  </TableHead>
                  <TableHead className="hidden sm:table-cell text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Observações
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-right">
                    Valor
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {debtPayments.map((payment) => (
                  <TableRow key={payment.id} className="border-slate-100 dark:border-white/5 hover:bg-slate-50/70 dark:hover:bg-white/5">
                    <TableCell className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
                      {formatDate(payment.created_at)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-slate-500 dark:text-slate-400">
                      {payment.notes ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  )
}
