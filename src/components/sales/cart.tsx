'use client'

import { useState, useRef } from 'react'
import { Minus, Plus, Trash2, ShoppingCart, Pencil, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils/format'
import type { CartItem } from '@/types/database'

interface CartProps {
  items: CartItem[]
  onUpdateQty: (productId: string, qty: number) => void
  onUpdatePrice: (productId: string, price: number) => void
  onUpdateDescription: (productId: string, desc: string) => void
  onRemove: (productId: string) => void
  /** Dense table for the fullscreen cashier screen. */
  variant?: 'default' | 'cashier'
}

export function Cart({
  items,
  onUpdateQty,
  onUpdatePrice,
  onUpdateDescription,
  onRemove,
  variant = 'default',
}: CartProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRaw, setEditRaw] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit(item: CartItem) {
    setEditingId(item.product.id)
    setEditRaw(
      (item.customPrice ?? item.product.sale_price).toFixed(2).replace('.', ','),
    )
    setTimeout(() => inputRef.current?.select(), 30)
  }

  function commitEdit(productId: string) {
    const parsed = parseFloat(editRaw.replace(',', '.'))
    if (!isNaN(parsed) && parsed > 0) {
      onUpdatePrice(productId, parsed)
    }
    setEditingId(null)
  }

  if (items.length === 0) {
    if (variant === 'cashier') {
      return (
        <div className="flex h-full min-h-[160px] flex-col items-center justify-center bg-slate-50 px-6 text-center">
          <ShoppingCart className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Cupom vazio</p>
          <p className="mt-1 text-xs text-slate-400">
            Bipe ou digite o produto à esquerda
          </p>
        </div>
      )
    }
    return (
      <div className="py-12 text-center text-slate-400">
        <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Nenhum produto adicionado</p>
      </div>
    )
  }

  if (variant === 'cashier') {
    return (
      <div className="flex h-full min-h-0 flex-col bg-white text-slate-900">
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:px-4">
          <span>Descrição</span>
          <span className="text-right">Qtd / Valores</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {[...items].reverse().map((item, reverseIndex) => {
            const index = items.length - reverseIndex
            const effectivePrice = item.customPrice ?? item.product.sale_price
            const isEditing = editingId === item.product.id
            const lineTotal = effectivePrice * item.quantity
            const isLatest = reverseIndex === 0

            return (
              <div
                key={item.product.id}
                className={`border-b border-slate-100 px-3 py-3 sm:px-4 ${
                  isLatest ? 'bg-emerald-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 w-7 shrink-0 text-xs font-bold tabular-nums text-slate-400">
                    {String(index).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-snug text-slate-900 sm:text-[15px]">
                      {item.product.name}
                    </p>
                    {!item.product.track_stock && (
                      <input
                        type="text"
                        placeholder="Descrição do item..."
                        value={item.itemDescription ?? ''}
                        onChange={(e) => onUpdateDescription(item.product.id, e.target.value)}
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#234e7a] focus:outline-none"
                      />
                    )}
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                      Cód. {item.product.code}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-red-500 hover:bg-red-50"
                    onClick={() => onRemove(item.product.id)}
                    aria-label={`Remover ${item.product.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pl-9">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                      onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      aria-label="Diminuir"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-black tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                      onClick={() => onUpdateQty(item.product.id, item.quantity + 1)}
                      disabled={
                        item.product.track_stock &&
                        item.quantity >= item.product.stock_quantity
                      }
                      aria-label="Aumentar"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <Input
                          ref={inputRef}
                          type="text"
                          inputMode="decimal"
                          value={editRaw}
                          onChange={(e) =>
                            setEditRaw(e.target.value.replace(/[^\d,.]/g, ''))
                          }
                          onBlur={() => commitEdit(item.product.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(item.product.id)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          className="h-8 w-24 border-emerald-400 px-1.5 text-xs"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            commitEdit(item.product.id)
                          }}
                          className="text-emerald-600"
                          aria-label="Confirmar preço"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="inline-flex items-center gap-1 tabular-nums text-slate-600 hover:text-[#234e7a]"
                      >
                        {formatCurrency(effectivePrice)}
                        <Pencil className="h-3 w-3 opacity-50" />
                      </button>
                    )}
                    <span
                      className={`font-black tabular-nums ${
                        isLatest ? 'text-emerald-700' : 'text-slate-900'
                      }`}
                    >
                      {formatCurrency(lineTotal)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const effectivePrice = item.customPrice ?? item.product.sale_price
        const isPriceOverridden =
          item.customPrice !== undefined &&
          item.customPrice !== item.product.sale_price
        const isEditing = editingId === item.product.id

        return (
          <div
            key={item.product.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-white/8 bg-white dark:bg-slate-800/60"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-slate-900 dark:text-slate-100">{item.product.name}</p>

              {!item.product.track_stock && (
                <input
                  type="text"
                  placeholder="Descrição do item..."
                  value={item.itemDescription ?? ''}
                  onChange={(e) => onUpdateDescription(item.product.id, e.target.value)}
                  className="mt-1 mb-0.5 w-full text-xs h-6 px-2 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-primary/60"
                />
              )}

              <div className="flex items-center gap-1 mt-0.5">
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-500">R$</span>
                    <Input
                      ref={inputRef}
                      type="text"
                      inputMode="decimal"
                      value={editRaw}
                      onChange={(e) =>
                        setEditRaw(e.target.value.replace(/[^\d,.]/g, ''))
                      }
                      onBlur={() => commitEdit(item.product.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit(item.product.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="h-6 w-24 text-xs px-1.5 py-0 border-primary/60 focus-visible:ring-1 focus-visible:ring-blue-400"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        commitEdit(item.product.id)
                      }}
                      className="text-primary hover:text-primary/80"
                      aria-label="Confirmar preço"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-xs ${isPriceOverridden ? 'text-amber-600 font-semibold' : 'text-slate-500'}`}
                    >
                      {formatCurrency(effectivePrice)}
                      {isPriceOverridden && (
                        <span className="ml-1 line-through text-slate-400 font-normal">
                          {formatCurrency(item.product.sale_price)}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="text-slate-300 hover:text-primary/80 transition-colors"
                      aria-label={`Editar preço de ${item.product.name}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {!isEditing && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    · subtotal:{' '}
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {formatCurrency(effectivePrice * item.quantity)}
                    </span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 sm:h-9 sm:w-9"
                onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}
                disabled={item.quantity <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-8 text-center text-sm font-medium tabular-nums">
                {item.quantity}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 sm:h-9 sm:w-9"
                onClick={() => onUpdateQty(item.product.id, item.quantity + 1)}
                disabled={item.product.track_stock && item.quantity >= item.product.stock_quantity}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 sm:h-9 sm:w-9 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
              onClick={() => onRemove(item.product.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-200 dark:border-white/8">
        <span className="font-semibold text-slate-700 dark:text-slate-300">Total</span>
        <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {formatCurrency(
            items.reduce(
              (sum, item) =>
                sum + (item.customPrice ?? item.product.sale_price) * item.quantity,
              0,
            ),
          )}
        </span>
      </div>
    </div>
  )
}
