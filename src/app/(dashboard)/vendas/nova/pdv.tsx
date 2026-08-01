'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Loader2,
  CheckCircle2,
  Search,
  CreditCard,
  Banknote,
  CloudOff,
  Printer,
  X,
  UserRound,
  UserPlus,
  Phone,
  Tag,
  ArrowLeft,
  Keyboard,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ProductSearch } from '@/components/sales/product-search'
import { Cart } from '@/components/sales/cart'
import { createSale } from '../actions'
import { searchCustomers, createCustomer } from '../../clientes/actions'
import { searchCustomersOffline } from '@/lib/offline/customers-repo'
import { queueSale } from '@/lib/offline/sales-repo'
import { formatCurrency } from '@/lib/utils/format'
import { printReceipt } from '@/lib/utils/print-receipt'
import type { CartItem, CustomerBalance, PaymentMethod, Product } from '@/types/database'

/** Snapshot of a sale saved offline, for the provisional confirmation banner. */
interface OfflineSaleConfirmation {
  items: { name: string; quantity: number; unit_price: number }[]
  total: number
  paymentLabel: string
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'credit', label: 'Cartão de Crédito' },
  { value: 'debit', label: 'Cartão de Débito' },
  { value: 'fiado', label: 'Fiado' },
]

interface PDVProps {
  avulsoProduct?: Product | null
}

export function PDV({ avulsoProduct }: PDVProps) {
  const router = useRouter()
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [offlineSale, setOfflineSale] = useState<OfflineSaleConfirmation | null>(null)
  const [triedSubmit, setTriedSubmit] = useState(false)
  const [cashReceivedRaw, setCashReceivedRaw] = useState('')
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

  const paymentMissing = !paymentMethod
  const customerMissing = paymentMethod === 'fiado' && !selectedCustomer

  const total = cartItems.reduce(
    (sum, item) => sum + (item.customPrice ?? item.product.sale_price) * item.quantity,
    0,
  )
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  const cashReceived = cashReceivedRaw.trim()
    ? parseFloat(cashReceivedRaw.replace(',', '.'))
    : NaN
  const hasCashEntered = !Number.isNaN(cashReceived)
  const change = hasCashEntered ? cashReceived - total : 0
  const cashShort = hasCashEntered && cashReceived < total

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
    if (paymentMethod !== 'fiado') return
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
  }, [customerQuery, paymentMethod])

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

  async function handleSubmit() {
    setTriedSubmit(true)

    if (cartItems.length === 0) {
      toast.error('Adicione pelo menos um produto')
      return
    }
    if (!paymentMethod) {
      toast.error('Selecione o método de pagamento')
      return
    }
    if (paymentMethod === 'cash' && hasCashEntered && cashShort) {
      toast.error('Valor recebido é menor que o total da venda')
      return
    }
    if (paymentMethod === 'fiado' && !selectedCustomer) {
      toast.error('Selecione um cliente para a venda fiada')
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
        await saveOffline(clientUuid)
        return
      }

      try {
        const result = await createSale({
          payment_method: paymentMethod,
          notes,
          items: rpcItems,
          client_uuid: clientUuid,
          customer_id: selectedCustomer?.id ?? null,
        })

        if (result.error) {
          // Sessão expirada mas ainda "online": grava na fila offline em vez de perder a venda
          if (
            result.code === 'unauthenticated' ||
            result.error.toLowerCase().includes('sessão')
          ) {
            await saveOffline(clientUuid)
            return
          }
          toast.error(result.error)
          return
        }

        // Limpa o carrinho antes do redirect — evita venda duplicada se o usuário clicar de novo
        resetForm()
        toast.success('Venda registrada com sucesso!')
        router.push(`/vendas/${result.saleId}`)
      } catch {
        await saveOffline(clientUuid)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function saveOffline(clientUuid: string) {
    if (!paymentMethod) return
    try {
      await queueSale({
        client_uuid: clientUuid,
        payment_method: paymentMethod,
        notes,
        total,
        customer_id: selectedCustomer?.id ?? null,
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
      paymentLabel:
        PAYMENT_OPTIONS.find((o) => o.value === paymentMethod)?.label ?? paymentMethod,
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
    setPaymentMethod('')
    setNotes('')
    setCashReceivedRaw('')
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
    setCheckoutOpen(true)
  }

  const canSubmit = !isSubmitting && cartItems.length > 0
  const lastItem = cartItems[cartItems.length - 1]
  const lastLineTotal = lastItem
    ? (lastItem.customPrice ?? lastItem.product.sale_price) * lastItem.quantity
    : 0

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      const typing =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable

      if (e.key === 'F10') {
        e.preventDefault()
        if (checkoutOpen) {
          if (canSubmit) void handleSubmit()
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
  }, [checkoutOpen, canSubmit, cartItems.length, avulsoProduct])

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
                F10 finalizar · Esc fechar pagamento
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

            {paymentMethod === 'cash' && hasCashEntered && (
              <div
                className={`rounded-2xl px-4 py-4 ${
                  cashShort ? 'bg-red-600' : 'bg-[#10233a] ring-1 ring-white/10'
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
                  {cashShort ? 'Falta receber' : 'Troco'}
                </p>
                <p className="mt-1 text-4xl font-black tabular-nums text-white">
                  {formatCurrency(Math.abs(change))}
                </p>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-white/10 p-4 sm:p-5">
            <Button
              className="h-14 w-full bg-emerald-500 text-base font-bold text-[#04120c] hover:bg-emerald-400 disabled:opacity-40"
              onClick={openCheckout}
              disabled={cartItems.length === 0 || isSubmitting}
            >
              Finalizar venda
              <kbd className="ml-2 rounded bg-black/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                F10
              </kbd>
            </Button>
          </div>
        </aside>
      </div>

      {/* Checkout sheet */}
      {checkoutOpen && (
        <div className="absolute inset-0 z-10 flex items-stretch justify-end bg-black/55 backdrop-blur-[2px]">
          <div
            className="absolute inset-0"
            onClick={() => setCheckoutOpen(false)}
            aria-hidden
          />
          <div className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0d1c31] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-white">Pagamento</p>
                <p className="text-xs text-white/45">{formatCurrency(total)}</p>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="rounded-md p-2 text-white/50 hover:bg-white/5 hover:text-white"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-white/70 flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" />
                  Método de pagamento <span className="text-red-400">*</span>
                </Label>
                <Select
                  value={paymentMethod}
                  items={PAYMENT_OPTIONS}
                  onValueChange={(v) => {
                    const next = v as PaymentMethod
                    setPaymentMethod(next)
                    if (next !== 'cash') setCashReceivedRaw('')
                    if (next !== 'fiado') {
                      setSelectedCustomer(null)
                      setCustomerQuery('')
                      setCustomerResults([])
                      setShowNewCustomerForm(false)
                    }
                  }}
                >
                  <SelectTrigger
                    aria-invalid={triedSubmit && paymentMissing}
                    className={
                      triedSubmit && paymentMissing
                        ? 'h-11 border-red-500 bg-[#0a1628] text-white'
                        : 'h-11 border-white/15 bg-[#0a1628] text-white'
                    }
                  >
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {triedSubmit && paymentMissing && (
                  <p className="text-red-400 text-xs">Selecione o método de pagamento.</p>
                )}
              </div>

              {paymentMethod === 'cash' && (
                <div className="space-y-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3">
                  <Label
                    htmlFor="cash-received"
                    className="text-xs font-medium text-emerald-200 flex items-center gap-1.5"
                  >
                    <Banknote className="h-3.5 w-3.5" />
                    Valor recebido
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-white/40">
                      R$
                    </span>
                    <Input
                      id="cash-received"
                      type="text"
                      inputMode="decimal"
                      value={cashReceivedRaw}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^\d,.]/g, '')
                        setCashReceivedRaw(cleaned)
                      }}
                      placeholder="0,00"
                      autoComplete="off"
                      className="h-11 border-emerald-400/30 bg-[#0a1628] pl-9 text-white"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[total, 50, 100, 200].map((preset, idx) => (
                      <button
                        key={`${preset}-${idx}`}
                        type="button"
                        onClick={() => setCashReceivedRaw(preset.toFixed(2).replace('.', ','))}
                        className="rounded-md border border-emerald-400/25 bg-black/20 px-2 py-1 text-[11px] font-medium text-emerald-100 hover:bg-emerald-500/20"
                      >
                        {idx === 0 ? 'Exato' : formatCurrency(preset)}
                      </button>
                    ))}
                  </div>
                  {hasCashEntered && (
                    <div
                      className={`rounded-xl px-4 py-3 text-white ${
                        cashShort ? 'bg-red-600' : 'bg-emerald-600'
                      }`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-90">
                        {cashShort ? 'Falta receber' : 'Troco a devolver'}
                      </p>
                      <p className="mt-1 text-3xl font-black tabular-nums">
                        {formatCurrency(Math.abs(change))}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'fiado' && (
                <div className="space-y-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3">
                  <Label className="text-xs font-medium text-amber-100 flex items-center gap-1.5">
                    <UserRound className="h-3.5 w-3.5" />
                    Cliente <span className="text-red-400">*</span>
                  </Label>

                  {selectedCustomer ? (
                    <div className="rounded-md border border-amber-400/20 bg-black/20 px-3 py-2 space-y-1.5">
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
                          onClick={() => {
                            setSelectedCustomer(null)
                            setCustomerQuery('')
                          }}
                          className="shrink-0 text-white/40 hover:text-white"
                          aria-label="Trocar cliente"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {selectedCustomer.current_debt > 0 ? (
                        <p className="rounded bg-red-500/15 px-2 py-1 text-xs font-medium text-red-300">
                          Possui {formatCurrency(selectedCustomer.current_debt)} em aberto
                        </p>
                      ) : (
                        <p className="rounded bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-300">
                          Sem débitos pendentes
                        </p>
                      )}
                    </div>
                  ) : showNewCustomerForm ? (
                    <div className="space-y-2">
                      <Input
                        placeholder="Nome completo *"
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                        className="h-9 border-amber-400/25 bg-[#0a1628] text-sm text-white"
                        autoFocus
                      />
                      <Input
                        placeholder="Telefone *"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(formatPhone(e.target.value))}
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
                          onClick={handleCreateCustomer}
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
                          className="h-8 border-white/15 bg-transparent text-xs text-white/70 hover:bg-white/5"
                          onClick={() => setShowNewCustomerForm(false)}
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
                          placeholder="Buscar por nome ou telefone..."
                          value={customerQuery}
                          onChange={(e) => setCustomerQuery(e.target.value)}
                          className="h-9 border-amber-400/25 bg-[#0a1628] pl-8 text-sm text-white"
                          autoFocus
                        />
                        {isSearchingCustomer && (
                          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-white/40" />
                        )}
                      </div>

                      {customerResults.length > 0 && (
                        <ul className="max-h-36 overflow-y-auto divide-y divide-white/5 rounded-md border border-white/10 bg-[#0a1628]">
                          {customerResults.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left transition-colors hover:bg-amber-500/10"
                                onClick={() => {
                                  setSelectedCustomer(c)
                                  setCustomerQuery('')
                                  setCustomerResults([])
                                }}
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

                      {customerQuery.trim() &&
                        !isSearchingCustomer &&
                        customerResults.length === 0 && (
                          <p className="py-1 text-center text-xs text-white/40">
                            Nenhum cliente encontrado.
                          </p>
                        )}

                      <button
                        type="button"
                        onClick={() => setShowNewCustomerForm(true)}
                        className="flex w-full items-center justify-center gap-1.5 py-1 text-xs font-medium text-amber-200 hover:text-amber-100"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Cadastrar novo cliente
                      </button>
                    </div>
                  )}

                  {triedSubmit && customerMissing && (
                    <p className="text-xs text-red-400">Selecione um cliente para continuar.</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs font-medium text-white/70">
                  Observações
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações opcionais..."
                  rows={2}
                  className="resize-none border-white/15 bg-[#0a1628] text-sm text-white placeholder:text-white/30"
                />
              </div>
            </div>

            <div className="shrink-0 border-t border-white/10 p-4">
              <Button
                className="h-14 w-full bg-emerald-500 text-base font-bold text-[#04120c] hover:bg-emerald-400 disabled:opacity-40"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    Confirmar venda
                    <kbd className="ml-2 rounded bg-black/15 px-1.5 py-0.5 font-mono text-[11px]">
                      F10
                    </kbd>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
