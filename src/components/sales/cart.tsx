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
        <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center px-6">
          <ShoppingCart className="h-14 w-14 mb-4 text-white/20" />
          <p className="text-lg font-semibold text-white/50">Aguardando itens</p>
          <p className="mt-1 text-sm text-white/35">
            Bipe o código ou digite o nome do produto
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
      <div className="flex h-full min-h-0 flex-col">
        <div className="grid grid-cols-[48px_minmax(0,1fr)_72px_100px_110px_44px] gap-2 border-b border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          <span>#</span>
          <span>Produto</span>
          <span className="text-center">Qtd</span>
          <span className="text-right">Unit.</span>
          <span className="text-right">Total</span>
          <span />
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
                className={`grid grid-cols-[48px_minmax(0,1fr)_72px_100px_110px_44px] items-center gap-2 border-b border-white/5 px-3 py-2.5 ${
                  isLatest ? 'bg-emerald-500/15' : 'hover:bg-white/[0.03]'
                }`}
              >
                <span className="tabular-nums text-sm text-white/40">{index}</span>
                <div className="min-w-0">
                  <p className={`truncate font-semibold ${isLatest ? 'text-white text-base' : 'text-white/90 text-sm'}`}>
                    {item.product.name}
                  </p>
                  {!item.product.track_stock && (
                    <input
                      type="text"
                      placeholder="Descrição do item..."
                      value={item.itemDescription ?? ''}
                      onChange={(e) => onUpdateDescription(item.product.id, e.target.value)}
                      className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 placeholder:text-white/30 focus:border-emerald-400/50 focus:outline-none"
                    />
                  )}
                  <p className="mt-0.5 truncate text-[11px] text-white/35">
                    Cód. {item.product.code}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-0.5">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30"
                    onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}
                    disabled={item.quantity <= 1}
                    aria-label="Diminuir"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-7 text-center text-sm font-bold tabular-nums text-white">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30"
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
                <div className="text-right">
                  {isEditing ? (
                    <div className="flex items-center justify-end gap-1">
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
                        className="h-7 w-20 border-emerald-400/40 bg-white/10 px-1.5 text-xs text-white"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          commitEdit(item.product.id)
                        }}
                        className="text-emerald-400"
                        aria-label="Confirmar preço"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="inline-flex items-center gap-1 text-sm tabular-nums text-white/70 hover:text-emerald-300"
                    >
                      {formatCurrency(effectivePrice)}
                      <Pencil className="h-3 w-3 opacity-50" />
                    </button>
                  )}
                </div>
                <span className={`text-right font-bold tabular-nums ${isLatest ? 'text-lg text-emerald-300' : 'text-sm text-white'}`}>
                  {formatCurrency(lineTotal)}
                </span>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded text-red-400/80 hover:bg-red-500/15 hover:text-red-300"
                  onClick={() => onRemove(item.product.id)}
                  aria-label={`Remover ${item.product.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
