'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  MessageCircle,
  MonitorSmartphone,
  Package,
  QrCode,
  ShoppingCart,
  UserRound,
  Tags,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  FEATURE_DEMO_STEPS,
  FEATURE_LIST,
  PRICING,
  SUPPORT,
  supportWhatsAppUrl,
} from '@/lib/config/plans'

export function PlansPageContent() {
  const wa = supportWhatsAppUrl()

  return (
    <div className="mx-auto max-w-3xl space-y-10 pb-12">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-[#1e3a5f] via-[#234e7a] to-emerald-800 px-6 py-10 text-white shadow-lg dark:border-white/10">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200/90">
          CaixaDoBairro
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Planos e como funciona
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-blue-100/90">
          Sistema de caixa para o mercadinho do bairro: vende no balcão, controla fiado e
          estoque, com suporte de perto.
        </p>
      </section>

      {/* Oferta fechada */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Oferta de entrada
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Condições pensadas para quem está começando com o sistema — depois, o plano padrão.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-xl border-2 border-emerald-400/80 bg-emerald-50/80 p-5 dark:border-emerald-500/40 dark:bg-emerald-500/10"
          >
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Primeiros {PRICING.entryMonths} meses
              </span>
            </div>
            <p className="mt-3 text-4xl font-black tabular-nums text-slate-900 dark:text-white">
              R$ {PRICING.entryMonthly}
              <span className="text-base font-semibold text-slate-500">/mês</span>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Preço de entrada para implantar com calma. Não é o preço definitivo da lista.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 }}
            className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-800/60"
          >
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Depois · plano padrão
            </p>
            <p className="mt-3 text-4xl font-black tabular-nums text-slate-900 dark:text-white">
              R$ {PRICING.standardMonthly}
              <span className="text-base font-semibold text-slate-500">/mês</span>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Anual: R$ {PRICING.annual} (≈ R$ {PRICING.annualPerMonthApprox}/mês). Fale conosco
              para fechar.
            </p>
          </motion.div>
        </div>
      </section>

      {/* O que é PDV */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          O que é o caixa (PDV)?
        </h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          <strong className="font-semibold text-slate-800 dark:text-slate-200">PDV</strong> significa{' '}
          <em>ponto de venda</em> — a tela em que você registra a compra do cliente, escolhe
          como ele paga e fecha a venda. No CaixaDoBairro isso é a página &quot;Nova venda&quot;.
        </p>
        <ol className="space-y-3">
          {FEATURE_DEMO_STEPS.map((step, i) => (
            <motion.li
              key={step.title}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-800/50"
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {step.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {step.body}
              </p>
            </motion.li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="bg-emerald-600 hover:bg-emerald-500">
            <Link href="/vendas/nova">
              <ShoppingCart className="mr-2 h-4 w-4" />
              Abrir o caixa
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/produtos">
              <Package className="mr-2 h-4 w-4" />
              Ver produtos
            </Link>
          </Button>
        </div>
      </section>

      {/* Lista de funções */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          O que entra no sistema
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {FEATURE_LIST.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: QrCode, label: 'PIX com QR no caixa' },
            { icon: Tags, label: 'Etiqueta de prateleira' },
            { icon: MonitorSmartphone, label: 'PC + site' },
            { icon: UserRound, label: 'Fiado organizado' },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300"
            >
              <Icon className="h-4 w-4 text-[#234e7a] dark:text-blue-300" />
              {label}
            </div>
          ))}
        </div>
      </section>

      {/* Suporte */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-800/60">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Suporte de verdade
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Fale com <strong>{SUPPORT.name}</strong> no WhatsApp ({SUPPORT.phoneDisplay}). Ajuda
          online e, quando combinar, orientação presencial na região — para você não ficar
          sozinho na hora de vender ou inventariar.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild className="bg-[#25D366] text-white hover:bg-[#1ebe57]">
            <a href={wa} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              WhatsApp com {SUPPORT.name}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`tel:+${SUPPORT.phoneE164}`}>Ligar / salvar contato</a>
          </Button>
        </div>
      </section>
    </div>
  )
}
