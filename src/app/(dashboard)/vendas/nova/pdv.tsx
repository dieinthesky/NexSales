'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Loader2,
  CheckCircle2,
  ShoppingCart,
  Search,
  Receipt,
  CreditCard,
  Banknote,
  CloudOff,
  Printer,
  X,
  UserRound,
  UserPlus,
  Phone,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

  const canSubmit = !isSubmitting && cartItems.length > 0

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      {offlineSale && (
        <div className="relative rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 shadow-sm">
          <button
            type="button"
            onClick={() => setOfflineSale(null)}
            aria-label="Fechar"
            className="absolute right-3 top-3 text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-200"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300">
            <CloudOff className="h-5 w-5" />
            <p className="font-semibold">Venda salva offline</p>
          </div>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-400">
            Recibo provisório — será enviada ao servidor automaticamente quando a
            conexão voltar.
          </p>
          <div className="mt-3 rounded-lg bg-white/70 dark:bg-white/5 border border-amber-200 dark:border-amber-500/20 divide-y divide-amber-100 dark:divide-white/5 text-sm">
            {offlineSale.items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between px-3 py-1.5">
                <span className="text-slate-700 dark:text-slate-300">
                  {item.quantity}× {item.name}
                </span>
                <span className="tabular-nums text-slate-600 dark:text-slate-400">
                  {formatCurrency(item.unit_price * item.quantity)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">
              <span>Total · {offlineSale.paymentLabel}</span>
              <span className="tabular-nums">{formatCurrency(offlineSale.total)}</span>
            </div>
          </div>
          <Button
            onClick={handlePrintOffline}
            variant="outline"
            className="mt-3 border-amber-300 dark:border-amber-500/30 bg-white dark:bg-amber-500/10 text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20"
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Imprimir recibo
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                Buscar produto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ProductSearch onAdd={handleAddItem} />
              {avulsoProduct && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:border-slate-400 transition-colors"
                  onClick={handleAddAvulso}
                >
                  <Tag className="h-3.5 w-3.5 mr-1.5" />
                  Item Avulso
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                Carrinho
              </CardTitle>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-white/10 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                {itemCount} {itemCount === 1 ? 'item' : 'itens'}
              </span>
            </CardHeader>
            <CardContent>
              <Cart
                items={cartItems}
                onUpdateQty={handleUpdateQty}
                onUpdatePrice={handleUpdatePrice}
                onUpdateDescription={handleUpdateDescription}
                onRemove={handleRemove}
              />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="lg:sticky lg:top-24 border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/60 dark:bg-white/3 border-b border-slate-100 dark:border-white/5 pb-3">
              <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Receipt className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                Finalizar venda
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                  Método de pagamento <span className="text-red-500">*</span>
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
                        ? 'h-10 border-red-500 ring-2 ring-red-100 dark:ring-red-900/30'
                        : 'h-10 border-slate-200 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200'
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
                  <p className="text-red-500 text-xs">
                    Selecione o método de pagamento para finalizar.
                  </p>
                )}
              </div>

              {paymentMethod === 'cash' && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/8 p-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cash-received"
                      className="text-xs font-medium text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5"
                    >
                      <Banknote className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                      Valor recebido
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 dark:text-slate-400 pointer-events-none">
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
                        className="h-10 pl-9 bg-white dark:bg-slate-800/60 border-emerald-200 dark:border-emerald-500/20 dark:text-slate-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200 dark:focus-visible:ring-emerald-900/30"
                      />
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {[total, 50, 100, 200].map((preset, idx) => (
                        <button
                          key={`${preset}-${idx}`}
                          type="button"
                          onClick={() => setCashReceivedRaw(preset.toFixed(2).replace('.', ','))}
                          className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-white dark:bg-slate-700/50 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/15 transition-colors"
                        >
                          {idx === 0 ? 'Valor exato' : formatCurrency(preset)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {hasCashEntered && (
                    <div
                      className={
                        cashShort
                          ? 'rounded-xl bg-red-600 px-4 py-4 shadow-md shadow-red-900/10 text-white'
                          : 'rounded-xl bg-emerald-600 px-4 py-4 shadow-md shadow-emerald-900/10 text-white'
                      }
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-90">
                        {cashShort ? 'Falta receber' : 'Troco a devolver'}
                      </p>
                      <p className="text-4xl font-bold tabular-nums leading-tight mt-1">
                        {formatCurrency(Math.abs(change))}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'fiado' && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/8 p-3 space-y-3">
                  <Label className="text-xs font-medium text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <UserRound className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                    Cliente <span className="text-red-500">*</span>
                  </Label>

                  {selectedCustomer ? (
                    <div className="rounded-md bg-white dark:bg-white/5 border border-amber-200 dark:border-amber-500/20 px-3 py-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{selectedCustomer.full_name}</p>
                          {selectedCustomer.phone && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                              <Phone className="h-3 w-3" />
                              {selectedCustomer.phone}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => { setSelectedCustomer(null); setCustomerQuery('') }}
                          className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 shrink-0"
                          aria-label="Trocar cliente"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {selectedCustomer.current_debt > 0 ? (
                        <p className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded px-2 py-1">
                          Possui {formatCurrency(selectedCustomer.current_debt)} em aberto
                        </p>
                      ) : (
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 rounded px-2 py-1">
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
                        className="h-9 text-sm border-amber-200 dark:border-amber-500/20 bg-white dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder:text-slate-500"
                        autoFocus
                      />
                      <Input
                        placeholder="Telefone *"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(formatPhone(e.target.value))}
                        inputMode="numeric"
                        className="h-9 text-sm border-amber-200 dark:border-amber-500/20 bg-white dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder:text-slate-500"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1 h-8 bg-amber-600 hover:bg-amber-700 text-white text-xs"
                          disabled={!newCustomerName.trim() || !newCustomerPhone.trim() || isCreatingCustomer}
                          onClick={handleCreateCustomer}
                        >
                          {isCreatingCustomer ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Cadastrar'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs border-amber-200 dark:border-amber-500/20 dark:text-slate-300 dark:hover:bg-white/5"
                          onClick={() => setShowNewCustomerForm(false)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
                        <Input
                          placeholder="Buscar por nome ou telefone..."
                          value={customerQuery}
                          onChange={(e) => setCustomerQuery(e.target.value)}
                          className="h-9 pl-8 text-sm border-amber-200 dark:border-amber-500/20 bg-white dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder:text-slate-500"
                          autoFocus
                        />
                        {isSearchingCustomer && (
                          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400 dark:text-slate-500" />
                        )}
                      </div>

                      {customerResults.length > 0 && (
                        <ul className="rounded-md border border-amber-200 dark:border-amber-500/20 bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-white/5 max-h-36 overflow-y-auto">
                          {customerResults.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                                onClick={() => { setSelectedCustomer(c); setCustomerQuery(''); setCustomerResults([]) }}
                              >
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{c.full_name}</p>
                                {c.phone && <p className="text-xs text-slate-500 dark:text-slate-400">{c.phone}</p>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {customerQuery.trim() && !isSearchingCustomer && customerResults.length === 0 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-1">Nenhum cliente encontrado.</p>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowNewCustomerForm(true)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 font-medium py-1"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Cadastrar novo cliente
                      </button>
                    </div>
                  )}

                  {triedSubmit && customerMissing && (
                    <p className="text-red-500 text-xs">Selecione um cliente para continuar.</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Observações
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações opcionais..."
                  rows={2}
                  className="border-slate-200 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder:text-slate-500 text-sm resize-none"
                />
              </div>

              <div className="rounded-lg bg-slate-900 dark:bg-slate-950/80 dark:border dark:border-white/8 text-white p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'itens'})</span>
                  <span className="tabular-nums">{formatCurrency(total)}</span>
                </div>
                <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                  <span className="text-sm text-slate-300 font-medium">Total</span>
                  <span className="text-3xl font-bold tracking-tight tabular-nums">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              <Button
                className="hidden lg:flex w-full h-12 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold text-base shadow-sm shadow-green-900/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  </>
                )}
              </Button>

              {cartItems.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  Adicione produtos ao carrinho para finalizar.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Barra fixa de checkout (mobile only) */}
      {cartItems.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-slate-900/80 px-4 py-3 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                {itemCount} {itemCount === 1 ? 'item' : 'itens'}
              </p>
              <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100 leading-tight">
                {formatCurrency(total)}
              </p>
            </div>
            <Button
              className="h-12 px-6 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold shadow-sm disabled:opacity-50 transition-colors"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  Confirmar
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
