'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CalendarDays,
  FileDown,
  Printer,
  TrendingUp,
  Receipt,
  Wallet,
} from 'lucide-react'
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
import { formatCurrency, PAYMENT_LABELS } from '@/lib/utils/format'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { CashCloseSummary, SaleItemSummary } from '@/lib/queries/cash-close'
import type { PaymentMethod } from '@/types/database'

type PaymentStyle = { badge: string; dot: string; bar: string }

const PAYMENT_STYLES: Record<PaymentMethod, PaymentStyle> = {
  cash: {
    badge: 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/15',
    dot: 'bg-green-500',
    bar: 'bg-green-500',
  },
  pix: {
    badge: 'bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/15',
    dot: 'bg-purple-500',
    bar: 'bg-purple-500',
  },
  credit: {
    badge: 'bg-primary/5 text-primary/80 ring-1 ring-inset ring-primary/20',
    dot: 'bg-primary/90',
    bar: 'bg-primary/90',
  },
  debit: {
    badge: 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/15',
    dot: 'bg-orange-500',
    bar: 'bg-orange-500',
  },
  fiado: {
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
  },
  mixed: {
    badge: 'bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-600/15',
    dot: 'bg-teal-500',
    bar: 'bg-teal-500',
  },
}

interface CashCloseViewProps {
  summary: CashCloseSummary
}

export function CashCloseView({ summary }: CashCloseViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function handleDateChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('date', value)
    else params.delete('date')
    startTransition(() => router.push(`/vendas/fechamento?${params.toString()}`))
  }

  // In the desktop shell, prefer the native Windows print dialog (full
  // printer list) and the native "save as" flow for PDFs. On the web,
  // `window.vendasDesktop` is undefined and we fall back to `window.print()`
  // — users can still pick "Microsoft Print to PDF" from the browser dialog.
  async function handlePrint() {
    const bridge = typeof window !== 'undefined' ? window.vendasDesktop : undefined
    if (bridge) {
      const result = await bridge.print()
      if (!result.ok && result.reason === 'error') {
        toast.error('Não foi possível imprimir. Tente novamente.')
      }
      return
    }
    window.print()
  }

  // dd-MM-yyyy (não usamos '/' porque o Windows bloqueia esse char em nome
  // de arquivo). O texto do botão de salvar fica humano: "Histórico de
  // vendas - 08-06-2026.pdf".
  const summaryDateBR = format(new Date(`${summary.date}T12:00:00`), 'dd-MM-yyyy')
  const pdfSuggestedName = `Histórico de vendas - ${summaryDateBR}.pdf`

  async function handleSavePdf() {
    const bridge = typeof window !== 'undefined' ? window.vendasDesktop : undefined
    if (bridge) {
      const result = await bridge.savePdf({ suggestedName: pdfSuggestedName })
      if (result.ok) {
        toast.success('PDF salvo com sucesso.')
      } else if (result.reason === 'error') {
        toast.error('Não foi possível salvar o PDF.')
      }
      return
    }
    toast.info('No diálogo de impressão, escolha "Salvar como PDF" ou "Microsoft Print to PDF".')
    window.print()
  }

  const displayDate = format(
    new Date(`${summary.date}T12:00:00`),
    "EEEE, dd 'de' MMMM 'de' yyyy",
    { locale: ptBR },
  )

  return (
    <div className="space-y-6">
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body > * {
            visibility: hidden;
          }
          .cash-close-print-area,
          .cash-close-print-area * {
            visibility: visible;
          }
          .cash-close-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
          }
          .cash-close-no-print {
            display: none !important;
          }
          @page {
            size: A4;
            margin: 18mm;
          }
        }
      `}</style>

      <div className="cash-close-no-print">
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/vendas">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Voltar
          </Link>
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
              Fechamento de Caixa
            </h1>
            <p className="text-sm text-slate-500 mt-1 capitalize">{displayDate}</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={summary.date}
                onChange={(e) => handleDateChange(e.target.value)}
                disabled={isPending}
                className="h-10 pl-9 pr-3 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <Button
              onClick={handleSavePdf}
              variant="outline"
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <FileDown className="mr-1.5 h-4 w-4" />
              Salvar PDF
            </Button>
            <Button
              onClick={handlePrint}
              className="bg-primary hover:bg-primary/90 text-white shadow-sm"
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Imprimir
            </Button>
          </div>
        </div>
      </div>

      <div className="cash-close-print-area space-y-6">
        {/* Print-only header */}
        <div className="hidden print:block text-center pb-4 border-b border-slate-300">
          <h1 className="text-xl font-bold">Fechamento de Caixa</h1>
          <p className="text-sm capitalize mt-1">{displayDate}</p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Total do dia"
            value={formatCurrency(summary.total)}
            tone="emerald"
          />
          <KpiCard
            icon={<Receipt className="h-4 w-4" />}
            label="Vendas"
            value={String(summary.count)}
            tone="blue"
          />
          <KpiCard
            icon={<Wallet className="h-4 w-4" />}
            label="Ticket médio"
            value={formatCurrency(summary.averageTicket)}
            tone="slate"
          />
        </div>

        {/* By payment method */}
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-900">
              Recebimento por método
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.byPayment.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma venda registrada nesse dia.</p>
            ) : (
              <div className="space-y-3">
                {summary.byPayment.map((p) => {
                  const style = PAYMENT_STYLES[p.method]
                  const pct = summary.total > 0 ? (p.total / summary.total) * 100 : 0
                  return (
                    <div key={p.method} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                          <span className="text-sm font-medium text-slate-900">
                            {PAYMENT_LABELS[p.method]}
                          </span>
                          <span className="text-xs text-slate-500">
                            ({p.count} {p.count === 1 ? 'venda' : 'vendas'})
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900 tabular-nums">
                            {formatCurrency(p.total)}
                          </p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {pct.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${style.bar} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sales list */}
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-900">
              Vendas do dia ({summary.count})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 h-11 pl-3 sm:pl-6 w-16 sm:w-20">
                    Hora
                  </TableHead>
                  {/* "Pagamento" some no mobile — o badge aparece embaixo
                      da hora pra economizar largura. */}
                  <TableHead className="hidden sm:table-cell text-xs font-semibold uppercase tracking-wide text-slate-500 w-36">
                    Pagamento
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Itens
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 text-right pr-3 sm:pr-6 w-24 sm:w-32">
                    Total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.sales.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="text-center py-10 text-sm text-slate-400">
                      Sem vendas nesse dia.
                    </TableCell>
                  </TableRow>
                ) : (
                  summary.sales.map((sale) => {
                    const style = PAYMENT_STYLES[sale.payment_method]
                    return (
                      <TableRow key={sale.id} className="border-slate-100 align-top">
                        <TableCell className="pl-3 sm:pl-6 pt-3 text-sm text-slate-600 tabular-nums">
                          <div>{format(new Date(sale.created_at), 'HH:mm')}</div>
                          <div className="sm:hidden mt-1">
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${style.badge}`}
                            >
                              <span className={`h-1 w-1 rounded-full ${style.dot}`} />
                              {PAYMENT_LABELS[sale.payment_method]}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell pt-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${style.badge}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                            {PAYMENT_LABELS[sale.payment_method]}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <ItemsList items={sale.items} notes={sale.notes} />
                        </TableCell>
                        <TableCell className="text-right pr-3 sm:pr-6 pt-3 font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(sale.total_amount)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Print-only signature line */}
        <div className="hidden print:block pt-12">
          <div className="flex justify-between text-sm">
            <div className="border-t border-slate-400 pt-1 w-64 text-center">Responsável</div>
            <div className="border-t border-slate-400 pt-1 w-64 text-center">Data / Hora</div>
          </div>
        </div>
      </div>
    </div>
  )
}

const TONE_STYLES = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  blue: 'bg-primary/5 text-primary/80 ring-primary/20',
  slate: 'bg-slate-50 text-slate-700 ring-slate-600/15',
} as const

type Tone = keyof typeof TONE_STYLES

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: Tone
}) {
  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          <span
            className={`h-7 w-7 rounded-md inline-flex items-center justify-center ring-1 ring-inset ${TONE_STYLES[tone]}`}
          >
            {icon}
          </span>
          {label}
        </div>
        <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

/**
 * Compact view of a sale's items, used inside the cash-close table.
 * Renders one line per item: "qty × name — subtotal". Notes (if any) appear
 * as a subtle italic line below.
 */
function ItemsList({
  items,
  notes,
}: {
  items: SaleItemSummary[]
  notes: string | null
}) {
  if (items.length === 0) {
    return <span className="text-sm text-slate-400">—</span>
  }

  return (
    <div className="space-y-1">
      {items.map((item, idx) => (
        <div
          key={`${item.productCode}-${idx}`}
          className="flex items-start gap-2 text-sm leading-snug"
        >
          <span className="inline-flex items-center justify-center min-w-7 h-5 px-1.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold tabular-nums">
            {item.quantity}×
          </span>
          <span className="flex-1 text-slate-800 break-words">{item.productName}</span>
          <span className="text-slate-500 tabular-nums text-xs whitespace-nowrap">
            {formatCurrency(item.subtotal)}
          </span>
        </div>
      ))}
      {notes && (
        <p className="pt-1 text-xs italic text-slate-500 border-t border-slate-100 mt-1.5">
          Obs: {notes}
        </p>
      )}
    </div>
  )
}
