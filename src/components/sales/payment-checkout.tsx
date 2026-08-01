'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  Loader2,
  Phone,
  Search,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency, PAYMENT_LABELS } from '@/lib/utils/format'
import type { CustomerBalance, PaymentMethod } from '@/types/database'

export type TenderMethod = Exclude<PaymentMethod, 'mixed'>

export interface InformedPayment {
  id: string
  method: TenderMethod
  /** Valor digitado (no dinheiro pode ser maior que o restante — gera troco). */
  amount: number
}

/** Códigos iguais aos da Trevo / PDV de balcão. */
export const PAYMENT_CODES: Record<string, TenderMethod> = {
  '01': 'cash',
  '1': 'cash',
  '24': 'pix',
  '25': 'debit',
  '26': 'credit',
  '99': 'fiado',
}

const CODE_HINTS = [
  { code: '01', label: 'Dinheiro' },
  { code: '24', label: 'PIX' },
  { code: '25', label: 'Débito' },
  { code: '26', label: 'Crédito' },
  { code: '99', label: 'Fiado' },
]

function parseMoney(raw: string): number {
  const n = parseFloat(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** Converte valores informados (com possível troco) em linhas que somam o total da venda. */
export function allocatePayments(
  informed: InformedPayment[],
  saleTotal: number,
): { method: TenderMethod; amount: number }[] {
  let left = round2(saleTotal)
  const out: { method: TenderMethod; amount: number }[] = []
  for (const row of informed) {
    if (left <= 0) break
    const take = round2(Math.min(row.amount, left))
    if (take > 0) {
      out.push({ method: row.method, amount: take })
      left = round2(left - take)
    }
  }
  return out
}

interface PaymentCheckoutProps {
  total: number
  notes: string
  onNotesChange: (v: string) => void
  informed: InformedPayment[]
  onInformedChange: (rows: InformedPayment[]) => void
  isSubmitting: boolean
  onClose: () => void
  onConfirm: () => void
  // Fiado
  selectedCustomer: CustomerBalance | null
  onClearCustomer: () => void
  customerQuery: string
  onCustomerQueryChange: (v: string) => void
  customerResults: CustomerBalance[]
  isSearchingCustomer: boolean
  showNewCustomerForm: boolean
  onShowNewCustomerForm: (v: boolean) => void
  newCustomerName: string
  onNewCustomerNameChange: (v: string) => void
  newCustomerPhone: string
  onNewCustomerPhoneChange: (v: string) => void
  isCreatingCustomer: boolean
  onCreateCustomer: () => void
  onSelectCustomer: (c: CustomerBalance) => void
  customerMissing: boolean
  triedSubmit: boolean
}

export function PaymentCheckout({
  total,
  notes,
  onNotesChange,
  informed,
  onInformedChange,
  isSubmitting,
  onClose,
  onConfirm,
  selectedCustomer,
  onClearCustomer,
  customerQuery,
  onCustomerQueryChange,
  customerResults,
  isSearchingCustomer,
  showNewCustomerForm,
  onShowNewCustomerForm,
  newCustomerName,
  onNewCustomerNameChange,
  newCustomerPhone,
  onNewCustomerPhoneChange,
  isCreatingCustomer,
  onCreateCustomer,
  onSelectCustomer,
  customerMissing,
  triedSubmit,
}: PaymentCheckoutProps) {
  const [methodCode, setMethodCode] = useState('')
  const [amountRaw, setAmountRaw] = useState('')
  const [step, setStep] = useState<'method' | 'amount'>('method')

  const methodRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const paid = round2(informed.reduce((s, r) => s + r.amount, 0))
  const missing = round2(Math.max(0, total - paid))
  const change = round2(Math.max(0, paid - total))
  const covered = missing < 0.01
  const resolvedMethod = PAYMENT_CODES[methodCode.trim()] ?? null
  const hasFiado = informed.some((r) => r.method === 'fiado') || resolvedMethod === 'fiado'

  useEffect(() => {
    methodRef.current?.focus()
  }, [])

  useEffect(() => {
    if (step === 'method') methodRef.current?.focus()
    if (step === 'amount') {
      amountRef.current?.focus()
      amountRef.current?.select()
    }
  }, [step])

  function resetDraft(nextRemaining = missing) {
    setMethodCode('')
    setAmountRaw(
      nextRemaining > 0 ? nextRemaining.toFixed(2).replace('.', ',') : '',
    )
    setStep('method')
    requestAnimationFrame(() => methodRef.current?.focus())
  }

  function acceptMethod() {
    const code = methodCode.trim()
    const method = PAYMENT_CODES[code]
    if (!method) {
      setMethodCode('')
      return
    }
    if (method === 'fiado' && informed.length > 0) {
      // Fiado só sozinho
      onInformedChange([])
    }
    if (method !== 'fiado' && informed.some((r) => r.method === 'fiado')) {
      onInformedChange([])
    }
    const rest = method === 'fiado' ? total : missing > 0 ? missing : total
    setAmountRaw(rest.toFixed(2).replace('.', ','))
    setStep('amount')
  }

  function addInformed() {
    const method = PAYMENT_CODES[methodCode.trim()]
    const amount = parseMoney(amountRaw)
    if (!method) {
      setStep('method')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      amountRef.current?.select()
      return
    }

    // Cartão/PIX/fiado não podem passar do que falta (dinheiro pode — vira troco).
    if (method !== 'cash' && amount > missing + 0.009 && missing > 0) {
      setAmountRaw(missing.toFixed(2).replace('.', ','))
      amountRef.current?.select()
      return
    }
    if (method === 'fiado' && Math.abs(amount - total) > 0.009) {
      setAmountRaw(total.toFixed(2).replace('.', ','))
      amountRef.current?.select()
      return
    }

    const next: InformedPayment[] =
      method === 'fiado'
        ? [{ id: crypto.randomUUID(), method, amount: round2(amount) }]
        : [...informed.filter((r) => r.method !== 'fiado'), { id: crypto.randomUUID(), method, amount: round2(amount) }]

    onInformedChange(next)
    const nextPaid = round2(next.reduce((s, r) => s + r.amount, 0))
    const nextMissing = round2(Math.max(0, total - nextPaid))
    resetDraft(nextMissing)
  }

  function removeInformed(id: string) {
    const next = informed.filter((r) => r.id !== id)
    onInformedChange(next)
    const nextPaid = round2(next.reduce((s, r) => s + r.amount, 0))
    resetDraft(round2(Math.max(0, total - nextPaid)))
  }

  function handleMethodKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (covered && !methodCode.trim()) {
        onConfirm()
        return
      }
      acceptMethod()
    }
  }

  function handleAmountKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addInformed()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      resetDraft()
    }
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/65 p-3 backdrop-blur-[2px] sm:p-6">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1c31] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-white">Encerrar venda</p>
            <p className="text-xs text-white/45">
              Código da forma → Enter → valor → Enter · F7 confirma
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-white/50 hover:bg-white/5 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Esquerda: digitação estilo Trevo */}
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-[#0a1628] p-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                    Forma {step === 'method' ? '←' : ''}
                  </Label>
                  <Input
                    ref={methodRef}
                    value={methodCode}
                    onChange={(e) => setMethodCode(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    onKeyDown={handleMethodKeyDown}
                    onFocus={() => setStep('method')}
                    placeholder="01"
                    inputMode="numeric"
                    className="h-12 border-white/15 bg-black/20 text-center font-mono text-xl font-bold text-white"
                    autoComplete="off"
                  />
                  <p className="truncate text-center text-xs font-semibold text-emerald-300">
                    {resolvedMethod ? PAYMENT_LABELS[resolvedMethod] : '—'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                    Valor {step === 'amount' ? '←' : ''}
                  </Label>
                  <Input
                    ref={amountRef}
                    value={amountRaw}
                    onChange={(e) => setAmountRaw(e.target.value.replace(/[^\d,.]/g, ''))}
                    onKeyDown={handleAmountKeyDown}
                    onFocus={() => {
                      if (resolvedMethod) setStep('amount')
                    }}
                    placeholder="0,00"
                    inputMode="decimal"
                    disabled={!resolvedMethod}
                    className="h-12 border-white/15 bg-black/20 text-right font-mono text-xl font-bold tabular-nums text-white disabled:opacity-40"
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-white/35">
                    Dinheiro: pode digitar a nota (ex. 100) — o troco aparece à direita.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {CODE_HINTS.map((h) => (
                  <button
                    key={h.code}
                    type="button"
                    onClick={() => {
                      setMethodCode(h.code)
                      const rest = h.code === '99' ? total : missing > 0 ? missing : total
                      setAmountRaw(rest.toFixed(2).replace('.', ','))
                      setStep('amount')
                    }}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-white/70 hover:bg-white/10"
                  >
                    <span className="font-mono text-emerald-300">{h.code}</span> {h.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0a1628] overflow-hidden">
              <div className="border-b border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">
                Valores informados
              </div>
              {informed.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-white/35">
                  Nenhum pagamento ainda — digite o código e o valor.
                </p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {informed.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {PAYMENT_LABELS[row.method] ?? row.method}
                        </p>
                        <p className="text-[11px] font-mono text-white/35">
                          {CODE_HINTS.find((h) => PAYMENT_CODES[h.code] === row.method)?.code ?? ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold tabular-nums text-emerald-300">
                          {formatCurrency(row.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeInformed(row.id)}
                          className="rounded p-1 text-white/35 hover:bg-white/5 hover:text-red-300"
                          aria-label="Remover"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {hasFiado && (
              <div className="space-y-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3">
                <Label className="text-xs font-medium text-amber-100 flex items-center gap-1.5">
                  <UserRound className="h-3.5 w-3.5" />
                  Cliente do fiado <span className="text-red-400">*</span>
                </Label>
                {selectedCustomer ? (
                  <div className="rounded-md border border-amber-400/20 bg-black/20 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {selectedCustomer.full_name}
                        </p>
                        {selectedCustomer.phone && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-white/45">
                            <Phone className="h-3 w-3" />
                            {selectedCustomer.phone}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={onClearCustomer}
                        className="text-white/40 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : showNewCustomerForm ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Nome completo *"
                      value={newCustomerName}
                      onChange={(e) => onNewCustomerNameChange(e.target.value)}
                      className="h-9 border-amber-400/25 bg-[#0a1628] text-sm text-white"
                      autoFocus
                    />
                    <Input
                      placeholder="Telefone *"
                      value={newCustomerPhone}
                      onChange={(e) => onNewCustomerPhoneChange(e.target.value)}
                      inputMode="numeric"
                      className="h-9 border-amber-400/25 bg-[#0a1628] text-sm text-white"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 flex-1 bg-amber-600 text-xs text-white hover:bg-amber-500"
                        disabled={
                          !newCustomerName.trim() ||
                          !newCustomerPhone.trim() ||
                          isCreatingCustomer
                        }
                        onClick={onCreateCustomer}
                      >
                        {isCreatingCustomer ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          'Cadastrar'
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 border-white/15 bg-transparent text-xs text-white/70"
                        onClick={() => onShowNewCustomerForm(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                      <Input
                        placeholder="Buscar cliente..."
                        value={customerQuery}
                        onChange={(e) => onCustomerQueryChange(e.target.value)}
                        className="h-9 border-amber-400/25 bg-[#0a1628] pl-8 text-sm text-white"
                      />
                      {isSearchingCustomer && (
                        <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-white/40" />
                      )}
                    </div>
                    {customerResults.length > 0 && (
                      <ul className="max-h-32 overflow-y-auto divide-y divide-white/5 rounded-md border border-white/10">
                        {customerResults.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-amber-500/10"
                              onClick={() => onSelectCustomer(c)}
                            >
                              <p className="text-sm font-medium text-white">{c.full_name}</p>
                              {c.phone && (
                                <p className="text-xs text-white/40">{c.phone}</p>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => onShowNewCustomerForm(true)}
                      className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-amber-200"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Cadastrar novo cliente
                    </button>
                  </div>
                )}
                {triedSubmit && customerMissing && (
                  <p className="text-xs text-red-400">Selecione um cliente para o fiado.</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-white/50">Observações</Label>
              <Textarea
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                rows={2}
                placeholder="Opcional..."
                className="resize-none border-white/15 bg-[#0a1628] text-sm text-white"
              />
            </div>
          </div>

          {/* Direita: totais grandes */}
          <div className="space-y-2">
            <TotalBlock label="Total" value={total} tone="teal" big />
            <TotalBlock label="Pago" value={paid} tone="blue" />
            {covered ? (
              <TotalBlock label="Troco" value={change} tone="orange" big />
            ) : (
              <TotalBlock label="Faltando" value={missing} tone="red" big />
            )}
            <p className="pt-2 text-[11px] leading-relaxed text-white/40">
              Ex.: compra R$ 100 → digite <span className="font-mono text-white/60">24</span> Enter{' '}
              <span className="font-mono text-white/60">50</span> Enter (PIX), depois{' '}
              <span className="font-mono text-white/60">01</span> Enter{' '}
              <span className="font-mono text-white/60">50</span> Enter (dinheiro) e confirme.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-white/10 p-4">
          <Button
            variant="outline"
            className="h-12 border-white/15 bg-transparent text-white hover:bg-white/5"
            onClick={onClose}
          >
            Não · Esc
          </Button>
          <Button
            className="h-12 flex-1 bg-emerald-500 text-base font-bold text-[#04120c] hover:bg-emerald-400 disabled:opacity-40"
            onClick={onConfirm}
            disabled={isSubmitting || !covered}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-5 w-5" />
                Sim — confirmar
                <kbd className="ml-2 rounded bg-black/15 px-1.5 py-0.5 font-mono text-[11px]">
                  F7
                </kbd>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function TotalBlock({
  label,
  value,
  tone,
  big,
}: {
  label: string
  value: number
  tone: 'teal' | 'blue' | 'orange' | 'red'
  big?: boolean
}) {
  const tones = {
    teal: 'from-teal-600 to-teal-700',
    blue: 'from-sky-600 to-blue-700',
    orange: 'from-orange-500 to-amber-600',
    red: 'from-red-600 to-rose-700',
  }
  return (
    <div className={`rounded-xl bg-gradient-to-br ${tones[tone]} px-4 py-3 text-white shadow-md`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">{label}</p>
      <p
        className={`mt-1 font-black tabular-nums leading-none ${
          big ? 'text-4xl sm:text-5xl' : 'text-2xl'
        }`}
      >
        {formatCurrency(value)}
      </p>
    </div>
  )
}
