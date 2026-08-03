import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  PRICING,
  SUPPORT,
  supportWhatsAppUrl,
  type SubscriptionView,
} from '@/lib/config/plans'

interface Props {
  storeName: string
  view: SubscriptionView
  isMaster: boolean
}

/** Visão do dono da loja: plano atual, valor e próxima cobrança. */
export function SubscriptionStatusView({ storeName, view, isMaster }: Props) {
  const wa = supportWhatsAppUrl()

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Minha assinatura
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{storeName}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-800/60">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Seu plano agora
        </p>
        <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{view.planLabel}</p>
        <p className="mt-3 text-4xl font-black tabular-nums text-[#1e3a5f] dark:text-emerald-300">
          {view.priceLabel}
        </p>
        <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 dark:border-white/10">
          <div className="flex justify-between gap-3 text-sm">
            <dt className="text-slate-500">Próximo pagamento</dt>
            <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {view.nextPaymentLabel}
            </dd>
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <dt className="text-slate-500">Situação</dt>
            <dd className="font-semibold text-slate-900 dark:text-slate-100">{view.periodLabel}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {view.message}
        </p>
        {view.isEntryPeriod && view.active && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
            Depois dos {PRICING.entryMonths} primeiros meses o valor sobe sozinho para R${' '}
            {PRICING.standardMonthly}/mês — sem surpresa e sem “depois a gente vê”.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-slate-800/40">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Precisa de ajuda?</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Fale com {SUPPORT.name} no WhatsApp ({SUPPORT.phoneDisplay}). Suporte no zap e, quando
          combinar, na loja.
        </p>
        <Button asChild className="mt-4 bg-[#25D366] text-white hover:bg-[#1ebe57]">
          <a href={wa} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-2 h-4 w-4" />
            WhatsApp com {SUPPORT.name}
          </a>
        </Button>
      </div>

      {isMaster && (
        <p className="text-center text-xs text-slate-400">
          Conta Master: use <strong>Lojas</strong> para liberar a data de início da assinatura de
          cada cliente.
        </p>
      )}
    </div>
  )
}
