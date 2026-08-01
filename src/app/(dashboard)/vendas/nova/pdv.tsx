'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  CheckCircle2,
  CloudOff,
  Printer,
  X,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProductSearch } from '@/components/sales/product-search'
import { Cart } from '@/components/sales/cart'
import { PdvProductArt } from '@/components/sales/pdv-product-art'
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

  const isBusy = cartItems.length > 0
  const lastUnit = lastItem
    ? lastItem.customPrice ?? lastItem.product.sale_price
    : 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1a0a0c] text-white font-[family-name:var(--font-poppins),sans-serif]">
      {/* Top bar — SYSON style */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-black/40 bg-gradient-to-r from-[#5c0d14] via-[#8b1520] to-[#5c0d14] px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-semibold text-white/70 hover:bg-black/20 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Sair
          </Link>
          <div className="min-w-0">
            <p className="truncate text-base font-black tracking-wide text-white drop-shadow sm:text-lg">
              CaixaDoBairro
            </p>
            <p className="truncate text-[11px] font-medium text-amber-100/70">PDV do bairro</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-black uppercase tracking-wider shadow ${
              isBusy
                ? 'bg-[#1e3a8a] text-white ring-1 ring-blue-300/40'
                : 'bg-emerald-600 text-white ring-1 ring-emerald-200/40'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isBusy ? 'animate-pulse bg-amber-300' : 'bg-emerald-200'
              }`}
            />
            {isBusy ? 'Caixa ocupado' : 'Caixa livre'}
          </span>
          <span className="rounded bg-black/35 px-3 py-1.5 font-mono text-sm font-bold tabular-nums text-amber-200 sm:text-base">
            {clock || '--:--:--'}
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
        {/* Left: current item + barcode */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-gradient-to-b from-[#6b1018] via-[#4a0c12] to-[#2a080c]">
          {/* Current item banner */}
          <div className="shrink-0 border-b border-black/30 bg-black/25 px-3 py-3 sm:px-5 sm:py-4">
            {lastItem ? (
              <div className="flex gap-3 sm:gap-5">
                <PdvProductArt
                  name={lastItem.product.name}
                  className="h-28 w-28 shrink-0 sm:h-40 sm:w-40 lg:h-44 lg:w-44"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-200/70">
                    Item atual
                  </p>
                  <p className="mt-1 line-clamp-2 text-2xl font-black leading-tight text-white drop-shadow sm:text-4xl lg:text-5xl">
                    <span className="text-amber-300">{lastItem.quantity.toLocaleString('pt-BR')}</span>
                    <span className="mx-2 text-white/50">×</span>
                    {lastItem.product.name}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white/60">
                    Cód. {lastItem.product.code}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
                    <div className="rounded-md border border-white/15 bg-white px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Valor unitário
                      </p>
                      <p className="text-lg font-black tabular-nums text-slate-900 sm:text-xl">
                        {formatCurrency(lastUnit)}
                      </p>
                    </div>
                    <div className="rounded-md border border-amber-300/50 bg-amber-300 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-950/70">
                        Subtotal
                      </p>
                      <p className="text-lg font-black tabular-nums text-slate-900 sm:text-xl">
                        {formatCurrency(lastLineTotal)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 py-4 sm:py-8">
                <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/25 bg-black/20 sm:h-40 sm:w-40">
                  <span className="text-center text-xs font-bold uppercase tracking-wider text-white/35">
                    Aguardando
                    <br />
                    bipe
                  </span>
                </div>
                <div>
                  <p className="text-2xl font-black text-white/80 sm:text-4xl">Aguardando itens</p>
                  <p className="mt-2 text-sm text-white/45">
                    Bipe o código de barras ou digite o nome do produto
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 space-y-2 border-b border-black/30 bg-black/20 px-3 py-3 sm:px-5">
            <ProductSearch onAdd={handleAddItem} variant="cashier" />
          </div>

          {/* Mobile: cupom below search */}
          <div className="min-h-0 flex-1 overflow-hidden border-t border-black/20 lg:hidden">
            <div className="flex h-full min-h-[220px] flex-col">
              <div className="shrink-0 bg-[#0b1f4a] px-3 py-2 text-center text-xs font-black uppercase tracking-[0.25em] text-white">
                Cupom
              </div>
              <div className="min-h-0 flex-1">
                <Cart
                  items={cartItems}
                  onUpdateQty={handleUpdateQty}
                  onUpdatePrice={handleUpdatePrice}
                  onUpdateDescription={handleUpdateDescription}
                  onRemove={handleRemove}
                  variant="cashier"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Right: cupom (desktop) */}
        <aside className="hidden min-h-0 w-full shrink-0 flex-col border-l border-black/40 bg-[#0b1f4a] lg:flex lg:w-[420px] xl:w-[480px]">
          <div className="shrink-0 bg-[#071536] px-4 py-2.5 text-center">
            <p className="text-sm font-black uppercase tracking-[0.3em] text-white">Cupom</p>
            <p className="text-[11px] font-medium text-blue-200/70">
              {itemCount} {itemCount === 1 ? 'item' : 'itens'} · Consumidor final
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <Cart
              items={cartItems}
              onUpdateQty={handleUpdateQty}
              onUpdatePrice={handleUpdatePrice}
              onUpdateDescription={handleUpdateDescription}
              onRemove={handleRemove}
              variant="cashier"
            />
          </div>
        </aside>
      </div>

      {/* Bottom: status + total + shortcuts */}
      <footer className="shrink-0 border-t border-black/50 bg-[#12060a]">
        <div className="flex flex-col gap-0 sm:flex-row">
          <div
            className={`flex items-center justify-center px-4 py-3 sm:w-56 sm:py-0 ${
              isBusy ? 'bg-[#1e3a8a]' : 'bg-emerald-700'
            }`}
          >
            <p className="text-center text-sm font-black uppercase tracking-[0.18em] text-white sm:text-base">
              {isBusy ? 'Caixa ocupado' : 'Caixa livre'}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3 bg-gradient-to-r from-[#9a1522] to-[#6b1018] px-4 py-3 sm:px-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-100/70">
                Total da venda
              </p>
              <p className="text-4xl font-black leading-none tracking-tight tabular-nums text-amber-300 drop-shadow sm:text-5xl lg:text-6xl">
                {formatCurrency(total)}
              </p>
            </div>
            <Button
              className="h-14 shrink-0 bg-amber-400 px-5 text-base font-black text-slate-900 hover:bg-amber-300 disabled:opacity-40 sm:h-16 sm:px-8 sm:text-lg"
              onClick={openCheckout}
              disabled={cartItems.length === 0 || isSubmitting}
            >
              Encerrar
              <kbd className="ml-2 rounded bg-black/15 px-1.5 py-0.5 font-mono text-xs font-bold">
                F7
              </kbd>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-stretch gap-1 border-t border-black/40 bg-[#0b1f4a] px-2 py-1.5 sm:gap-2 sm:px-3">
          {avulsoProduct && (
            <button
              type="button"
              onClick={handleAddAvulso}
              className="inline-flex items-center gap-2 rounded bg-[#1e3a8a] px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#2563eb]"
            >
              <kbd className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px]">F4</kbd>
              Item avulso
            </button>
          )}
          <button
            type="button"
            onClick={openCheckout}
            disabled={cartItems.length === 0 || isSubmitting}
            className="inline-flex items-center gap-2 rounded bg-[#1e3a8a] px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#2563eb] disabled:opacity-40"
          >
            <kbd className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px]">F7</kbd>
            Encerrar venda
          </button>
          <button
            type="button"
            onClick={openCheckout}
            disabled={cartItems.length === 0 || isSubmitting}
            className="inline-flex items-center gap-2 rounded bg-[#1e3a8a] px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#2563eb] disabled:opacity-40"
          >
            <kbd className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px]">F10</kbd>
            Finalizar
          </button>
          {checkoutOpen && (
            <span className="inline-flex items-center gap-2 rounded bg-slate-700 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white/80">
              <kbd className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd>
              Cancelar pagamento
            </span>
          )}
          <span className="ml-auto hidden items-center px-2 text-[11px] font-medium text-blue-200/50 sm:inline-flex">
            Código → Enter → qtd → Enter · F7 confirma pagamento
          </span>
        </div>
      </footer>

      {/* Venda concluída — permanece no caixa */}
      {completedSale && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-xl border-2 border-amber-400/40 bg-[#2a080c] p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-300">
              <CheckCircle2 className="h-6 w-6" />
              <p className="text-lg font-black text-white">Venda concluída</p>
            </div>
            <p className="mt-3 text-4xl font-black tabular-nums text-amber-300">
              {formatCurrency(completedSale.total)}
            </p>
            <p className="mt-1 text-sm text-white/50">{completedSale.paymentLabel}</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button
                className="h-12 flex-1 bg-amber-400 font-black text-slate-900 hover:bg-amber-300"
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
