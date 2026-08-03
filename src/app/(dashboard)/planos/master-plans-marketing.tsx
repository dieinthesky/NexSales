'use client'

import { MessageCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  MASTER_FEATURE_LIST,
  PRICING,
  SUPPORT,
  supportWhatsAppUrl,
} from '@/lib/config/plans'

/** Material comercial — só conta Master. */
export function MasterPlansMarketing() {
  const wa = supportWhatsAppUrl(
    'Olá Luiz! Quero alinhar planos e liberação de loja no CaixaDoBairro.',
  )

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
          Master · material comercial
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Planos (só conta Master)
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          O cliente da loja vê só o status da assinatura e o WhatsApp. Aqui você enxerga a oferta
          fechada para negociar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border-2 border-emerald-400/70 bg-emerald-50/80 p-5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Primeiros {PRICING.entryMonths} meses
            </span>
          </div>
          <p className="mt-3 text-4xl font-black tabular-nums">
            R$ {PRICING.entryMonthly}
            <span className="text-base font-semibold text-slate-500">/mês</span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-800/60">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Depois · padrão
          </p>
          <p className="mt-3 text-4xl font-black tabular-nums">
            R$ {PRICING.standardMonthly}
            <span className="text-base font-semibold text-slate-500">/mês</span>
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Anual R$ {PRICING.annual} (≈ R$ {PRICING.annualPerMonthApprox}/mês)
          </p>
        </div>
      </div>

      <ul className="grid gap-1.5 text-sm text-slate-700 dark:text-slate-300 sm:grid-cols-2">
        {MASTER_FEATURE_LIST.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-emerald-600">✓</span>
            {item}
          </li>
        ))}
      </ul>

      <Button asChild className="bg-[#25D366] text-white hover:bg-[#1ebe57]">
        <a href={wa} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="mr-2 h-4 w-4" />
          WhatsApp {SUPPORT.name}
        </a>
      </Button>
    </div>
  )
}
