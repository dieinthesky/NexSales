import Link from 'next/link'
import { ArrowRight, ShoppingCart } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatRelative, PAYMENT_LABELS } from '@/lib/utils/format'
import type { Sale } from '@/types/database'
import type { PaymentMethod } from '@/types/database'

interface RecentSalesProps {
  sales: Sale[]
}

const PAYMENT_BADGE: Record<PaymentMethod, { badge: string; dot: string }> = {
  cash: { badge: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-600/15 dark:ring-green-500/20', dot: 'bg-green-500' },
  pix: { badge: 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 ring-1 ring-inset ring-purple-600/15 dark:ring-purple-500/20', dot: 'bg-purple-500' },
  credit: { badge: 'bg-primary/5 dark:bg-primary/10 text-primary/80 dark:text-primary/90 ring-1 ring-inset ring-primary/20', dot: 'bg-primary/90' },
  debit: { badge: 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 ring-1 ring-inset ring-orange-600/15 dark:ring-orange-500/20', dot: 'bg-orange-500' },
  fiado: { badge: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-600/15 dark:ring-amber-500/20', dot: 'bg-amber-500' },
  mixed: { badge: 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 ring-1 ring-inset ring-teal-600/15 dark:ring-teal-500/20', dot: 'bg-teal-500' },
}

export function RecentSales({ sales }: RecentSalesProps) {
  return (
    <Card className="flex flex-col h-full border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Últimas Vendas
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-slate-500 hover:text-slate-800 text-xs"
          >
            <Link href="/vendas" className="flex items-center gap-1">
              Ver todas
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 flex flex-col min-h-0">
        {sales.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-slate-400">Nenhuma venda registrada ainda.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sales.map((sale, idx) => {
              const style = PAYMENT_BADGE[sale.payment_method as PaymentMethod] ?? PAYMENT_BADGE.cash
              return (
                <Link
                  key={sale.id}
                  href={`/vendas/${sale.id}`}
                  className={`flex items-center justify-between px-6 py-3 hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors ${
                    idx !== sales.length - 1 ? 'border-b border-slate-100 dark:border-white/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatCurrency(sale.total_amount)}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{formatRelative(sale.created_at)}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${style.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    {PAYMENT_LABELS[sale.payment_method]}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
