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
import { PixQrPanel, type StorePixConfig } from '@/components/sales/pix-qr-panel'
import type { CustomerBalance, PaymentMethod } from '@/types/database'

export type TenderMethod = Exclude<PaymentMethod, 'mixed'>

export interface InformedPayment {
  id: string
  method: TenderMethod
  /** Valor digitado (no dinheiro pode ser maior que o restante — gera troco). */
  amount: number
}

/** Códigos simples no balcão: 1 Dinheiro, 2 PIX, 3 Débito, 4 Crédito, 5 Fiado.
 * Mantém os antigos (01, 24…) para quem já decorou. */
export const PAYMENT_CODES: Record<string, TenderMethod> = {
  // Novos (principais)
  '1': 'cash',
  '2': 'pix',
  '3': 'debit',
  '4': 'credit',
  '5': 'fiado',
  // Legado (Trevo / teclado antigo)
  '01': 'cash',
  '24': 'pix',
  '25': 'debit',
  '26': 'credit',
  '99': 'fiado',
}

const CODE_HINTS = [
  { code: '1', label: 'Dinheiro' },
  { code: '2', label: 'PIX' },
  { code: '3', label: 'Débito' },
  { code: '4', label: 'Crédito' },
  { code: '5', label: 'Fiado' },
]

const METHOD_PRIMARY_CODE: Record<TenderMethod, string> = {
  cash: '1',
  pix: '2',
  debit: '3',
  credit: '4',
  fiado: '5',
}

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
  /** Chave PIX da loja (QR no checkout). */
  pixConfig?: StorePixConfig | null
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
  pixConfig = null,
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
  const informedPix = round2(
    informed.filter((r) => r.method === 'pix').reduce((s, r) => s + r.amount, 0),
  )
  const draftAmount = parseMoney(amountRaw)
  const draftPix =
    resolvedMethod === 'pix' &&
    Number.isFinite(draftAmount) &&
    draftAmount > 0
      ? round2(draftAmount)
      : 0
  const showPixQr =
    resolvedMethod === 'pix' || informed.some((r) => r.method === 'pix')
  const pixQrAmount =
    draftPix > 0
      ? draftPix
      : informedPix > 0
        ? informedPix
        : resolvedMethod === 'pix'
          ? missing > 0
            ? missing
            : total
          : 0

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
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#1e3a5f]/55 p-3 backdrop-blur-[2px] sm:p-6">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#1e3a5f] px-4 py-3 text-white">
          <div>
            <p className="text-sm font-bold">Encerrar venda</p>
            <p className="text-xs text-blue-100/75">
              Código da forma → Enter → valor → Enter · F7 confirma
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto bg-[#e8edf3] p-4 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Esquerda: digitação estilo Trevo */}
          <div className="space-y-4">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Forma {step === 'method' ? '←' : ''}
                  </Label>
                  <Input
                    ref={methodRef}
                    value={methodCode}
                    onChange={(e) => setMethodCode(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    onKeyDown={handleMethodKeyDown}
                    onFocus={() => setStep('method')}
                    placeholder="1"
                    inputMode="numeric"
                    className="h-12 border-slate-300 bg-slate-50 text-center font-mono text-xl font-bold text-slate-900"
                    autoComplete="off"
                  />
                  <p className="truncate text-center text-xs font-semibold text-[#234e7a]">
                    {resolvedMethod ? PAYMENT_LABELS[resolvedMethod] : '—'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
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
                    className="h-12 border-slate-300 bg-slate-50 text-right font-mono text-xl font-bold tabular-nums text-slate-900 disabled:opacity-40"
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-slate-500">
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
                      const rest = h.code === '5' ? total : missing > 0 ? missing : total
                      setAmountRaw(rest.toFixed(2).replace('.', ','))
                      setStep('amount')
                    }}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
                      methodCode === h.code
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="font-mono text-[#234e7a]">{h.code}</span> {h.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Valores informados
              </div>
              {informed.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-400">
                  Nenhum pagamento ainda — digite o código e o valor.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {informed.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {PAYMENT_LABELS[row.method] ?? row.method}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400">
                          {METHOD_PRIMARY_CODE[row.method] ?? ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold tabular-nums text-[#234e7a]">
                          {formatCurrency(row.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeInformed(row.id)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
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
              <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                <Label className="flex items-center gap-1.5 text-xs font-medium text-amber-900">
                  <UserRound className="h-3.5 w-3.5" />
                  Cliente do fiado <span className="text-red-600">*</span>
                </Label>
                {selectedCustomer ? (
                  <div className="rounded-md border border-amber-200 bg-white px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {selectedCustomer.full_name}
                        </p>
                        {selectedCustomer.phone && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                            <Phone className="h-3 w-3" />
                            {selectedCustomer.phone}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={onClearCustomer}
                        className="text-slate-400 hover:text-slate-700"
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
                      className="h-9 border-amber-300 bg-white text-sm"
                      autoFocus
                    />
                    <Input
                      placeholder="Telefone *"
                      value={newCustomerPhone}
                      onChange={(e) => onNewCustomerPhoneChange(e.target.value)}
                      inputMode="numeric"
                      className="h-9 border-amber-300 bg-white text-sm"
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
                        className="h-8 text-xs"
                        onClick={() => onShowNewCustomerForm(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <Input
                        placeholder="Buscar cliente..."
                        value={customerQuery}
                        onChange={(e) => onCustomerQueryChange(e.target.value)}
                        className="h-9 border-amber-300 bg-white pl-8 text-sm"
                      />
                      {isSearchingCustomer && (
                        <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" />
                      )}
                    </div>
                    {customerResults.length > 0 && (
                      <ul className="max-h-32 overflow-y-auto divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                        {customerResults.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-amber-50"
                              onClick={() => onSelectCustomer(c)}
                            >
                              <p className="text-sm font-medium text-slate-900">{c.full_name}</p>
                              {c.phone && (
                                <p className="text-xs text-slate-500">{c.phone}</p>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => onShowNewCustomerForm(true)}
                      className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-amber-800"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Cadastrar novo cliente
                    </button>
                  </div>
                )}
                {triedSubmit && customerMissing && (
                  <p className="text-xs text-red-600">Selecione um cliente para o fiado.</p>
                )}
              </div>
            )}

            <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <Label className="text-xs text-slate-500">Observações</Label>
              <Textarea
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                rows={2}
                placeholder="Opcional..."
                className="resize-none border-slate-300 bg-slate-50 text-sm"
              />
            </div>
          </div>

          {/* Direita: totais grandes — mesma família de cor do PDV */}
          <div className="space-y-2">
            <TotalBlock label="Total" value={total} tone="navy" big />
            <TotalBlock label="Pago" value={paid} tone="blue" />
            {covered ? (
              <TotalBlock label="Troco" value={change} tone="green" big />
            ) : (
              <TotalBlock label="Faltando" value={missing} tone="amber" big />
            )}
            <PixQrPanel
              config={pixConfig}
              amount={
                showPixQr && pixQrAmount > 0
                  ? pixQrAmount
                  : missing > 0
                    ? missing
                    : total
              }
            />
            <p className="pt-2 text-[11px] leading-relaxed text-slate-500">
              PIX: digite <span className="font-mono text-slate-700">2</span> + valor. Misto ex.:{' '}
              <span className="font-mono text-slate-700">2</span> Enter 50 +{' '}
              <span className="font-mono text-slate-700">1</span> Enter 50.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-slate-200 bg-white p-4">
          <Button
            variant="outline"
            className="h-12"
            onClick={onClose}
          >
            Não · Esc
          </Button>
          <Button
            className="h-12 flex-1 bg-emerald-500 text-base font-bold text-emerald-950 hover:bg-emerald-400 disabled:opacity-40"
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
                <kbd className="ml-2 rounded bg-black/10 px-1.5 py-0.5 font-mono text-[11px]">
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
  tone: 'navy' | 'blue' | 'green' | 'amber'
  big?: boolean
}) {
  const tones = {
    navy: 'bg-[#1e3a5f] text-white',
    blue: 'bg-[#234e7a] text-white',
    green: 'bg-emerald-500 text-emerald-950',
    amber: 'bg-amber-400 text-amber-950',
  }
  return (
    <div className={`rounded-xl px-4 py-3 shadow-sm ${tones[tone]}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-80">{label}</p>
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
