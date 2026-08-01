'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Loader2,
  CheckCircle2,
  Search,
  CloudOff,
  Printer,
  X,
  Tag,
  ArrowLeft,
  Keyboard,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProductSearch } from '@/components/sales/product-search'
import { Cart } from '@/components/sales/cart'
import {
  PaymentCheckout,
  allocatePayments,
  type InformedPayment,
  type TenderMethod,
} from '@/components/sales/payment-checkout'
import { createSale } from '../actions'
import { searchCustomers, createCustomer } from '../../clientes/actions'
import { searchCustomersOffline } from '@/lib/offline/customers-repo'
import { queueSale } from '@/lib/offline/sales-repo'
import { formatCurrency, PAYMENT_LABELS } from '@/lib/utils/format'
import { printReceipt } from '@/lib/utils/print-receipt'
import type { CartItem, CustomerBalance, PaymentMethod, Product } from '@/types/database'

/** Snapshot of a sale saved offline, for the provisional confirmation banner. */
interface OfflineSaleConfirmation {
  items: { name: string; quantity: number; unit_price: number }[]
  total: number
  paymentLabel: string
}

interface CompletedSale {
  saleId: string
  total: number
  paymentLabel: string
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

interface PDVProps {
  avulsoProduct?: Product | null
}

export function PDV({ avulsoProduct }: PDVProps) {
  const router = useRouter()
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [informedPays, setInformedPays] = useState<InformedPayment[]>([])
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [offlineSale, setOfflineSale] = useState<OfflineSaleConfirmation | null>(null)
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)
  const [triedSubmit, setTriedSubmit] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [clock, setClock] = useState('')

  // --- Fiado: seleção de cliente ---
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerBalance | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerBalance[]>([])
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false)
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const tick = () => {
      setClock(
        new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(new Date()),
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const total = cartItems.reduce(
    (sum, item) => sum + (item.customPrice ?? item.product.sale_price) * item.quantity,
    0,
  )
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  const paidInformed = round2(informedPays.reduce((s, r) => s + r.amount, 0))
  const missingPay = round2(Math.max(0, total - paidInformed))
  const changeDue = round2(Math.max(0, paidInformed - total))
  const hasFiadoLine = informedPays.some((l) => l.method === 'fiado')
  const customerMissing = hasFiadoLine && !selectedCustomer

  function paymentLabelFromLines(
    lines: { method: PaymentMethod | ''; amount: number }[],
  ): string {
    const valid = lines.filter(
      (l) => l.method && l.method !== 'mixed' && Number.isFinite(l.amount) && l.amount > 0,
    )
    if (valid.length === 0) return '—'
    if (valid.length === 1) {
      return PAYMENT_LABELS[valid[0].method] ?? valid[0].method
    }
    return valid
      .map((l) => `${PAYMENT_LABELS[l.method] ?? l.method} ${formatCurrency(l.amount)}`)
      .join(' + ')
  }

  function handleAddItem(item: CartItem) {
    const addQty = Math.max(1, item.quantity)
    setCartItems((prev) => {
      const existing = prev.find((i) => i.product.id === item.product.id)
      if (existing) {
        if (existing.product.track_stock) {
          return prev.map((i) =>
            i.product.id === item.product.id
              ? {
                  ...i,
                  quantity: Math.min(
                    i.quantity + addQty,
                    existing.product.stock_quantity,
                  ),
                }
              : i
          )
        }
        return prev.map((i) =>
          i.product.id === item.product.id
            ? { ...i, quantity: i.quantity + addQty }
            : i
        )
      }
      return [...prev, item]
    })
  }

  function handleUpdateDescription(productId: string, desc: string) {
    setCartItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, itemDescription: desc } : item
      )
    )
  }

  function handleUpdateQty(productId: string, qty: number) {
    setCartItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: qty } : item
      )
    )
  }

  function handleUpdatePrice(productId: string, price: number) {
    setCartItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, customPrice: price } : item
      )
    )
  }

  function handleRemove(productId: string) {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId))
  }

  useEffect(() => {
    if (!hasFiadoLine) return
    if (!customerQuery.trim()) {
      setCustomerResults([])
      return
    }
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(async () => {
      setIsSearchingCustomer(true)
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const rows = await searchCustomersOffline(customerQuery)
        setCustomerResults(rows)
      } else {
        const result = await searchCustomers(customerQuery)
        setCustomerResults(result.customers ?? [])
      }
      setIsSearchingCustomer(false)
    }, 350)
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current)
    }
  }, [customerQuery, hasFiadoLine])

  useEffect(() => {
    if (hasFiadoLine) return
    setSelectedCustomer(null)
    setCustomerQuery('')
    setCustomerResults([])
    setShowNewCustomerForm(false)
  }, [hasFiadoLine])

  function formatPhone(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 2) return digits.length ? `(${digits}` : ''
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }

  async function handleCreateCustomer() {
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) return
    setIsCreatingCustomer(true)
    const result = await createCustomer({ fullName: newCustomerName, phone: newCustomerPhone })
    setIsCreatingCustomer(false)
    if (result.error) {
      toast.error('Erro ao criar cliente: ' + result.error)
      return
    }
    if (result.customer) {
      setSelectedCustomer({
        ...result.customer,
        total_fiado: 0,
        total_paid: 0,
        current_debt: 0,
        last_payment_at: null,
        first_fiado_at: null,
      })
      setCustomerQuery('')
      setCustomerResults([])
      setShowNewCustomerForm(false)
      setNewCustomerName('')
      setNewCustomerPhone('')
      toast.success(`Cliente "${result.customer.full_name}" cadastrado!`)
    }
  }

  function buildPayments():
    | { header: PaymentMethod; lines: { method: TenderMethod; amount: number }[]; label: string }
    | { error: string } {
    if (informedPays.length === 0) {
      return { error: 'Informe ao menos uma forma de pagamento' }
    }
    if (missingPay > 0.009) {
      return { error: `Ainda falta ${formatCurrency(missingPay)}` }
    }

    const lines = allocatePayments(informedPays, total)
    const sum = round2(lines.reduce((s, l) => s + l.amount, 0))
    if (lines.length === 0 || Math.abs(sum - total) > 0.009) {
      return { error: 'Pagamentos não fecham o total da venda' }
    }

    const fiadoCount = lines.filter((l) => l.method === 'fiado').length
    if (fiadoCount > 0 && lines.length > 1) {
      return { error: 'Fiado não pode misturar com outras formas de pagamento' }
    }
    if (fiadoCount > 0 && !selectedCustomer) {
      return { error: 'Selecione um cliente para a venda fiada' }
    }

    const header: PaymentMethod = lines.length > 1 ? 'mixed' : lines[0].method
    return { header, lines, label: paymentLabelFromLines(lines) }
  }

  async function handleSubmit() {
    setTriedSubmit(true)

    if (cartItems.length === 0) {
      toast.error('Adicione pelo menos um produto')
      return
    }

    const built = buildPayments()
    if ('error' in built) {
      toast.error(built.error)
      return
    }

    const avulsoWithoutPrice = cartItems.some(
      (item) => !item.product.track_stock && !(item.customPrice && item.customPrice > 0)
    )
    if (avulsoWithoutPrice) {
      toast.error('Defina o valor dos itens avulsos antes de finalizar')
      return
    }

    setIsSubmitting(true)

    const clientUuid = crypto.randomUUID()
    const rpcItems = cartItems.map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
      ...(item.customPrice !== undefined ? { unit_price: item.customPrice } : {}),
      ...(item.itemDescription ? { item_description: item.itemDescription } : {}),
    }))

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await saveOffline(clientUuid, built.header, built.lines, built.label)
        return
      }

      try {
        const result = await createSale({
          payment_method: built.header,
          notes,
          items: rpcItems,
          client_uuid: clientUuid,
          customer_id: selectedCustomer?.id ?? null,
          payments: built.lines,
        })

        if (result.error) {
          // Sessão expirada mas ainda "online": grava na fila offline em vez de perder a venda
          if (
            result.code === 'unauthenticated' ||
            result.error.toLowerCase().includes('sessão')
          ) {
            await saveOffline(clientUuid, built.header, built.lines, built.label)
            return
          }
          toast.error(result.error)
          return
        }

        const saleId = result.saleId!
        const saleTotal = total
        const saleLabel = built.label
        resetForm()
        setCompletedSale({ saleId, total: saleTotal, paymentLabel: saleLabel })
        toast.success('Venda registrada!')
      } catch {
        await saveOffline(clientUuid, built.header, built.lines, built.label)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function saveOffline(
    clientUuid: string,
    header: PaymentMethod,
    lines: { method: TenderMethod; amount: number }[],
    label: string,
  ) {
    try {
      await queueSale({
        client_uuid: clientUuid,
        payment_method: header,
        notes,
        total,
        customer_id: selectedCustomer?.id ?? null,
        payments: lines,
        items: cartItems.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          name: item.product.name,
          unit_price: item.customPrice ?? item.product.sale_price,
          ...(item.itemDescription ? { item_description: item.itemDescription } : {}),
        })),
      })
    } catch {
      toast.error('Não foi possível salvar a venda offline.')
      return
    }

    const confirmation: OfflineSaleConfirmation = {
      total,
      paymentLabel: label,
      items: cartItems.map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        unit_price: item.customPrice ?? item.product.sale_price,
      })),
    }

    resetForm()
    setOfflineSale(confirmation)
    toast.success('Venda salva offline — será enviada ao reconectar.')
  }

  function handlePrintOffline() {
    if (!offlineSale) return
    const ok = printReceipt({
      items: offlineSale.items,
      total: offlineSale.total,
      paymentLabel: offlineSale.paymentLabel,
      provisional: true,
    })
    if (!ok) {
      toast.error('Não foi possível abrir a impressão. Verifique o bloqueador de pop-ups.')
    }
  }

  function resetForm() {
    setCartItems([])
    setInformedPays([])
    setNotes('')
    setTriedSubmit(false)
    setCheckoutOpen(false)
    setSelectedCustomer(null)
    setCustomerQuery('')
    setCustomerResults([])
    setShowNewCustomerForm(false)
    setNewCustomerName('')
    setNewCustomerPhone('')
  }

  function handleAddAvulso() {
    if (!avulsoProduct) return
    handleAddItem({ product: avulsoProduct, quantity: 1, customPrice: 0 })
  }

  function openCheckout() {
    if (cartItems.length === 0) {
      toast.error('Adicione pelo menos um produto')
      return
    }
    setCompletedSale(null)
    setInformedPays([])
    setTriedSubmit(false)
    setCheckoutOpen(true)
  }

  const canSubmit = !isSubmitting && cartItems.length > 0 && missingPay < 0.01
  const lastItem = cartItems[cartItems.length - 1]
  const lastLineTotal = lastItem
    ? (lastItem.customPrice ?? lastItem.product.sale_price) * lastItem.quantity
    : 0

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      const typing =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable

      // F7 = fluxo Trevo (abrir / confirmar). F10 também funciona.
      if (e.key === 'F7' || e.key === 'F10') {
        e.preventDefault()
        if (checkoutOpen) {
          void handleSubmit()
        } else {
          openCheckout()
        }
        return
      }
      if (e.key === 'F4' && !typing) {
        e.preventDefault()
        handleAddAvulso()
        return
      }
      if (e.key === 'Escape' && checkoutOpen) {
        e.preventDefault()
        setCheckoutOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over latest state intentionally
  }, [checkoutOpen, canSubmit, cartItems.length, avulsoProduct, missingPay, informedPays])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#07111f] text-white font-[family-name:var(--font-poppins),sans-serif]">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0b1a2e] px-3 py-2.5 sm:px-5">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-white/55 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Sair
          </Link>
          <div className="hidden h-5 w-px bg-white/10 sm:block" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-wide text-white">CaixaDoBairro</p>
            <p className="truncate text-[11px] text-white/40">PDV do bairro</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/30">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Caixa aberto
          </span>
          <span className="hidden tabular-nums text-sm font-semibold text-white/70 sm:inline">
            {clock}
          </span>
        </div>
      </header>

      {offlineSale && (
        <div className="relative shrink-0 border-b border-amber-400/30 bg-amber-500/15 px-4 py-3">
          <button
            type="button"
            onClick={() => setOfflineSale(null)}
            aria-label="Fechar"
            className="absolute right-3 top-3 text-amber-200/70 hover:text-amber-100"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-amber-100">
            <CloudOff className="h-5 w-5" />
            <p className="font-semibold">Venda salva offline</p>
          </div>
          <p className="mt-1 text-sm text-amber-100/70">
            Recibo provisório — sobe sozinho quando a internet voltar.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {offlineSale.items.slice(0, 4).map((item, idx) => (
              <span key={idx} className="rounded bg-black/20 px-2 py-1 text-xs text-amber-50">
                {item.quantity}× {item.name}
              </span>
            ))}
            <span className="rounded bg-black/30 px-2 py-1 text-xs font-semibold text-white">
              {formatCurrency(offlineSale.total)} · {offlineSale.paymentLabel}
            </span>
          </div>
          <Button
            onClick={handlePrintOffline}
            variant="outline"
            size="sm"
            className="mt-3 border-amber-300/40 bg-transparent text-amber-50 hover:bg-amber-500/20"
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Imprimir recibo
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Main: bipe + lista */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col border-white/10 lg:border-r">
          <div className="shrink-0 space-y-2 border-b border-white/10 bg-[#0a1628] px-3 py-3 sm:px-5">
            <ProductSearch onAdd={handleAddItem} variant="cashier" />
            <div className="flex flex-wrap items-center gap-2">
              {avulsoProduct && (
                <button
                  type="button"
                  onClick={handleAddAvulso}
                  className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-white/20 px-3 py-1.5 text-xs font-medium text-white/60 hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-200"
                >
                  <Tag className="h-3.5 w-3.5" />
                  Item avulso
                  <kbd className="ml-1 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/45">
                    F4
                  </kbd>
                </button>
              )}
              <span className="inline-flex items-center gap-1.5 text-[11px] text-white/35">
                <Keyboard className="h-3 w-3" />
                F7 / F10 encerrar · F4 avulso
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-1 sm:px-2">
            <Cart
              items={cartItems}
              onUpdateQty={handleUpdateQty}
              onUpdatePrice={handleUpdatePrice}
              onUpdateDescription={handleUpdateDescription}
              onRemove={handleRemove}
              variant="cashier"
            />
          </div>
        </section>

        {/* Right rail: total (customer-facing) */}
        <aside className="flex w-full shrink-0 flex-col border-t border-white/10 bg-[#0b1a2e] lg:w-[360px] lg:border-t-0 xl:w-[400px]">
          <div className="flex-1 space-y-4 p-4 sm:p-5">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Último item
              </p>
              {lastItem ? (
                <>
                  <p className="mt-2 line-clamp-2 text-xl font-bold leading-tight text-white">
                    {lastItem.product.name}
                  </p>
                  <p className="mt-1 text-sm text-white/45">
                    {lastItem.quantity} ×{' '}
                    {formatCurrency(lastItem.customPrice ?? lastItem.product.sale_price)}
                  </p>
                  <p className="mt-3 text-3xl font-extrabold tabular-nums text-emerald-300">
                    {formatCurrency(lastLineTotal)}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-white/35">Nenhum item ainda</p>
              )}
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 shadow-lg shadow-emerald-950/40">
              <div className="flex items-center justify-between text-emerald-50/80">
                <span className="text-xs font-semibold uppercase tracking-[0.2em]">Total</span>
                <span className="text-xs font-medium">
                  {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                </span>
              </div>
              <p className="mt-2 text-5xl font-black leading-none tracking-tight tabular-nums text-white sm:text-6xl">
                {formatCurrency(total)}
              </p>
            </div>

          </div>

          <div className="shrink-0 border-t border-white/10 p-4 sm:p-5">
            <Button
              className="h-14 w-full bg-emerald-500 text-base font-bold text-[#04120c] hover:bg-emerald-400 disabled:opacity-40"
              onClick={openCheckout}
              disabled={cartItems.length === 0 || isSubmitting}
            >
              Encerrar venda
              <kbd className="ml-2 rounded bg-black/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                F7
              </kbd>
            </Button>
          </div>
        </aside>
      </div>

      {/* Venda concluída — permanece no caixa */}
      {completedSale && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-emerald-400/30 bg-[#0d1c31] p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="h-6 w-6" />
              <p className="text-lg font-bold text-white">Venda concluída</p>
            </div>
            <p className="mt-3 text-4xl font-black tabular-nums text-white">
              {formatCurrency(completedSale.total)}
            </p>
            <p className="mt-1 text-sm text-white/50">{completedSale.paymentLabel}</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button
                className="h-12 flex-1 bg-emerald-500 font-bold text-[#04120c] hover:bg-emerald-400"
                onClick={() => setCompletedSale(null)}
              >
                Nova venda
              </Button>
              <Button
                variant="outline"
                className="h-12 flex-1 border-white/15 bg-transparent text-white hover:bg-white/5"
                onClick={() => router.push(`/vendas/${completedSale.saleId}/recibo`)}
              >
                Ver recibo
              </Button>
            </div>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <PaymentCheckout
          total={total}
          notes={notes}
          onNotesChange={setNotes}
          informed={informedPays}
          onInformedChange={setInformedPays}
          isSubmitting={isSubmitting}
          onClose={() => setCheckoutOpen(false)}
          onConfirm={() => void handleSubmit()}
          selectedCustomer={selectedCustomer}
          onClearCustomer={() => {
            setSelectedCustomer(null)
            setCustomerQuery('')
          }}
          customerQuery={customerQuery}
          onCustomerQueryChange={setCustomerQuery}
          customerResults={customerResults}
          isSearchingCustomer={isSearchingCustomer}
          showNewCustomerForm={showNewCustomerForm}
          onShowNewCustomerForm={setShowNewCustomerForm}
          newCustomerName={newCustomerName}
          onNewCustomerNameChange={setNewCustomerName}
          newCustomerPhone={newCustomerPhone}
          onNewCustomerPhoneChange={(v) => setNewCustomerPhone(formatPhone(v))}
          isCreatingCustomer={isCreatingCustomer}
          onCreateCustomer={() => void handleCreateCustomer()}
          onSelectCustomer={(c) => {
            setSelectedCustomer(c)
            setCustomerQuery('')
            setCustomerResults([])
          }}
          customerMissing={customerMissing}
          triedSubmit={triedSubmit}
        />
      )}

    </div>
  )
}
