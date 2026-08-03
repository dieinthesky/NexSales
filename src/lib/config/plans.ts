/**
 * Planos comerciais CaixaDoBairro.
 * Preços e regras de cobrança — a UI do cliente só mostra o status da assinatura.
 */

export const SUPPORT = {
  name: 'Luiz',
  phoneDisplay: '+55 88 9704-0491',
  phoneE164: '558897040491',
  whatsappMessage:
    'Olá Luiz! Sou do mercadinho e precisava de ajuda com o CaixaDoBairro.',
} as const

export function supportWhatsAppUrl(customMessage?: string): string {
  const msg = customMessage ?? SUPPORT.whatsappMessage
  return `https://wa.me/${SUPPORT.phoneE164}?text=${encodeURIComponent(msg)}`
}

export const PRICING = {
  entryMonths: 3,
  entryMonthly: 60,
  standardMonthly: 99,
  annual: 890,
  annualPerMonthApprox: 74,
} as const

/** Código do produto técnico da assinatura (não aparece na lista). */
export const SUBSCRIPTION_PRODUCT_CODE = '__ASSINATURA__'

export type SubscriptionRecord = {
  /** ISO date YYYY-MM-DD do primeiro mês liberado */
  startedAt: string
  plan?: 'monthly' | 'annual'
}

export type SubscriptionView = {
  active: boolean
  planLabel: string
  priceMonthly: number
  priceLabel: string
  nextPaymentAt: Date | null
  nextPaymentLabel: string
  periodLabel: string
  monthsSinceStart: number
  entryMonthsLeft: number
  isEntryPeriod: boolean
  message: string
}

function parseDateOnly(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (!m) {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d)
  out.setMonth(out.getMonth() + n)
  return out
}

function monthsBetween(from: Date, to: Date): number {
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  return Math.max(0, months)
}

function formatBRDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Calcula plano atual: 3 meses a R$ 60, depois R$ 99/mês automático. */
export function computeSubscription(
  rec: SubscriptionRecord | null,
  now = new Date(),
): SubscriptionView {
  if (!rec?.startedAt) {
    return {
      active: false,
      planLabel: 'Aguardando liberação',
      priceMonthly: 0,
      priceLabel: '—',
      nextPaymentAt: null,
      nextPaymentLabel: '—',
      periodLabel: 'Sem data de início',
      monthsSinceStart: 0,
      entryMonthsLeft: PRICING.entryMonths,
      isEntryPeriod: true,
      message:
        'Quando o sistema for liberado, você verá aqui o plano e a próxima data de pagamento. Fale com o suporte se precisar.',
    }
  }

  const start = parseDateOnly(rec.startedAt)
  if (!start) {
    return computeSubscription(null, now)
  }

  if (rec.plan === 'annual') {
    const next = addMonths(start, 12)
    const paidThrough = next > now
    return {
      active: true,
      planLabel: 'Plano anual',
      priceMonthly: PRICING.annualPerMonthApprox,
      priceLabel: `R$ ${PRICING.annual}/ano`,
      nextPaymentAt: next,
      nextPaymentLabel: formatBRDate(next),
      periodLabel: paidThrough ? 'Anuidade em dia' : 'Renovação',
      monthsSinceStart: monthsBetween(start, now),
      entryMonthsLeft: 0,
      isEntryPeriod: false,
      message: paidThrough
        ? `Anuidade de R$ ${PRICING.annual}. Próxima renovação em ${formatBRDate(next)}.`
        : `Renovação do plano anual (R$ ${PRICING.annual}). Fale no WhatsApp para renovar.`,
    }
  }

  const months = monthsBetween(start, now)
  const isEntryPeriod = months < PRICING.entryMonths
  const entryMonthsLeft = Math.max(0, PRICING.entryMonths - months)
  const price = isEntryPeriod ? PRICING.entryMonthly : PRICING.standardMonthly
  const planLabel = isEntryPeriod
    ? `Entrada · mês ${months + 1} de ${PRICING.entryMonths}`
    : 'Plano padrão'

  // Próximo vencimento: aniversário mensal a partir do dia de início
  let next = new Date(start)
  while (next.getTime() <= now.getTime()) {
    next = addMonths(next, 1)
  }

  let message: string
  if (isEntryPeriod) {
    message =
      entryMonthsLeft === 1
        ? `Você está no último mês com valor de entrada (R$ ${PRICING.entryMonthly}). Depois a mensalidade passa a R$ ${PRICING.standardMonthly} automaticamente.`
        : `Promoção de entrada: R$ ${PRICING.entryMonthly}/mês nos primeiros ${PRICING.entryMonths} meses. Depois, R$ ${PRICING.standardMonthly}/mês automaticamente.`
  } else {
    message = `Plano padrão R$ ${PRICING.standardMonthly}/mês. Próximo pagamento em ${formatBRDate(next)}.`
  }

  return {
    active: true,
    planLabel,
    priceMonthly: price,
    priceLabel: `R$ ${price}/mês`,
    nextPaymentAt: next,
    nextPaymentLabel: formatBRDate(next),
    periodLabel: isEntryPeriod
      ? `Entrada (${entryMonthsLeft} ${entryMonthsLeft === 1 ? 'mês restante' : 'meses restantes'})`
      : 'Mensalidade padrão',
    monthsSinceStart: months,
    entryMonthsLeft,
    isEntryPeriod,
    message,
  }
}

export function formatStartedAtInput(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Textos só para conta Master (material comercial). */
export const MASTER_FEATURE_LIST = [
  'Caixa com bipagem de código de barras',
  'Cadastro de produtos, preços e categorias',
  'Controle de estoque e alerta de acabando',
  'Fiado com histórico e recebimento',
  'PIX com QR Code na tela do caixa',
  'Etiqueta de prateleira',
  'Histórico e fechamento de caixa',
  'Vários usuários e lojas separadas',
] as const
