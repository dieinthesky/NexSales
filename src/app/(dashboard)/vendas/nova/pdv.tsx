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
    <div className="fixed inset-0 z-50 flex flex-col bg-[#e8edf3] text-slate-900 font-[family-name:var(--font-poppins),sans-serif]">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-300 bg-[#1e3a5f] px-3 py-2 text-white sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Sair
          </Link>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold sm:text-base">CaixaDoBairro</p>
            <p className="truncate text-[11px] text-blue-100/70">PDV do bairro</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
              isBusy
                ? 'bg-amber-400 text-amber-950'
                : 'bg-emerald-400 text-emerald-950'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isBusy ? 'animate-pulse bg-amber-900' : 'bg-emerald-900'
              }`}
            />
            {isBusy ? 'Caixa ocupado' : 'Caixa aberto'}
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums text-blue-100">
            {clock || '--:--:--'}
          </span>
        </div>
      </header>

      {offlineSale && (
        <div className="relative shrink-0 border-b border-amber-400/40 bg-amber-100 px-4 py-3 text-amber-950">
          <button
            type="button"
            onClick={() => setOfflineSale(null)}
            aria-label="Fechar"
            className="absolute right-3 top-3 text-amber-700/70 hover:text-amber-900"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <CloudOff className="h-5 w-5" />
            <p className="font-semibold">Venda salva offline</p>
          </div>
          <p className="mt-1 text-sm text-amber-900/70">
            Recibo provisório — sobe sozinho quando a internet voltar.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {offlineSale.items.slice(0, 4).map((item, idx) => (
              <span key={idx} className="rounded bg-amber-200/80 px-2 py-1 text-xs">
                {item.quantity}× {item.name}
              </span>
            ))}
            <span className="rounded bg-amber-900 px-2 py-1 text-xs font-semibold text-amber-50">
              {formatCurrency(offlineSale.total)} · {offlineSale.paymentLabel}
            </span>
          </div>
          <Button
            onClick={handlePrintOffline}
            variant="outline"
            size="sm"
            className="mt-3 border-amber-700/30 bg-transparent text-amber-950 hover:bg-amber-200"
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Imprimir recibo
          </Button>
        </div>
      )}

      {/* Banner: item atual */}
      <div className="shrink-0 bg-[#234e7a] px-3 py-3 text-white sm:px-5 sm:py-4">
        {lastItem ? (
          <p className="line-clamp-2 text-xl font-black uppercase leading-tight tracking-wide sm:text-3xl lg:text-4xl">
            {lastItem.quantity.toLocaleString('pt-BR')} X {lastItem.product.name}
          </p>
        ) : (
          <p className="text-xl font-bold text-white/70 sm:text-3xl">Aguardando produto…</p>
        )}
      </div>

      {/* Corpo: foto | campos | cupom */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row lg:gap-4 lg:p-4">
        {/* Esquerda + meio */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row">
            {/* Foto */}
            <div className="flex shrink-0 justify-center sm:w-[220px] lg:w-[260px]">
              {lastItem ? (
                <PdvProductArt
                  name={lastItem.product.name}
                  className="h-44 w-full max-w-[260px] rounded-2xl sm:h-full sm:min-h-[220px]"
                />
              ) : (
                <div className="flex h-44 w-full max-w-[260px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white text-center text-sm font-semibold text-slate-400 sm:h-full sm:min-h-[220px]">
                  Foto do
                  <br />
                  produto
                </div>
              )}
            </div>

            {/* Campos */}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 sm:p-4">
                <ProductSearch onAdd={handleAddItem} variant="cashier" />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Quantidade
                  </p>
                  <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">
                    {lastItem ? lastItem.quantity : '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Valor unitário
                  </p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-slate-900 sm:text-3xl">
                    {lastItem ? formatCurrency(lastUnit) : '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 shadow-sm ring-1 ring-emerald-200">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700/80">
                    Valor total
                  </p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-emerald-800 sm:text-3xl">
                    {lastItem ? formatCurrency(lastLineTotal) : '—'}
                  </p>
                </div>
              </div>

              {avulsoProduct && (
                <button
                  type="button"
                  onClick={handleAddAvulso}
                  className="self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Item avulso <kbd className="ml-1 rounded bg-slate-100 px-1 font-mono">F4</kbd>
                </button>
              )}
            </div>
          </div>

          {/* Mobile cupom */}
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 lg:hidden">
            <div className="border-b border-slate-200 bg-[#1e3a5f] px-3 py-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-white">
              Cupom · {itemCount} {itemCount === 1 ? 'item' : 'itens'}
            </div>
            <div className="min-h-[180px]">
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
        </section>

        {/* Direita: cupom */}
        <aside className="hidden min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 lg:flex lg:w-[420px] xl:w-[480px]">
          <div className="shrink-0 bg-[#1e3a5f] px-4 py-2.5 text-center text-white">
            <p className="text-sm font-black uppercase tracking-[0.25em]">Cupom</p>
            <p className="text-[11px] text-blue-100/80">
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

      {/* Rodapé: status + total + atalhos */}
      <footer className="shrink-0 border-t border-slate-300 bg-white">
        <div className="flex flex-col sm:flex-row">
          <div
            className={`flex items-center justify-center px-4 py-3 sm:w-52 ${
              isBusy ? 'bg-[#1e3a5f] text-white' : 'bg-emerald-600 text-white'
            }`}
          >
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Aviso</p>
              <p className="text-sm font-black uppercase tracking-wide sm:text-base">
                {isBusy ? 'Caixa ocupado' : 'Caixa aberto'}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3 bg-[#234e7a] px-4 py-3 text-white sm:px-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-100/70">
                Subtotal
              </p>
              <p className="text-4xl font-black tabular-nums sm:text-5xl">
                {formatCurrency(total)}
              </p>
            </div>
            <Button
              className="h-14 shrink-0 bg-emerald-400 px-5 text-base font-bold text-emerald-950 hover:bg-emerald-300 disabled:opacity-40 sm:h-16 sm:px-8 sm:text-lg"
              onClick={openCheckout}
              disabled={cartItems.length === 0 || isSubmitting}
            >
              Encerrar
              <kbd className="ml-2 rounded bg-black/10 px-1.5 py-0.5 font-mono text-xs">F7</kbd>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-[#1e3a5f] px-3 py-1.5 text-white">
          {avulsoProduct && (
            <span className="rounded bg-white/10 px-2 py-1 text-[11px] font-semibold">
              <kbd className="mr-1 font-mono text-[10px] opacity-70">F4</kbd> Avulso
            </span>
          )}
          <span className="rounded bg-white/10 px-2 py-1 text-[11px] font-semibold">
            <kbd className="mr-1 font-mono text-[10px] opacity-70">F7</kbd> Encerrar venda
          </span>
          <span className="rounded bg-white/10 px-2 py-1 text-[11px] font-semibold">
            <kbd className="mr-1 font-mono text-[10px] opacity-70">F10</kbd> Finalizar
          </span>
          <span className="ml-auto hidden text-[11px] text-blue-100/60 sm:inline">
            Bipe → Enter → qtd → Enter · F7 recebe o pagamento
          </span>
        </div>
      </footer>

      {completedSale && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-emerald-300 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
              <p className="text-lg font-bold text-slate-900">Venda concluída</p>
            </div>
            <p className="mt-3 text-4xl font-black tabular-nums text-slate-900">
              {formatCurrency(completedSale.total)}
            </p>
            <p className="mt-1 text-sm text-slate-500">{completedSale.paymentLabel}</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button
                className="h-12 flex-1 bg-emerald-500 font-bold text-white hover:bg-emerald-400"
                onClick={() => setCompletedSale(null)}
              >
                Nova venda
              </Button>
              <Button
                variant="outline"
                className="h-12 flex-1"
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
