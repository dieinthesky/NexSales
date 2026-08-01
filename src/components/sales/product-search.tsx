'use client'

import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Search, Plus, Minus, ScanBarcode, CheckCircle2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/format'
import { useDebounce } from '@/hooks/use-debounce'
import {
  searchProducts,
  getByCode,
  ensureProductsCached,
} from '@/lib/offline/products-repo'
import type { Product, CartItem } from '@/types/database'

interface ProductSearchProps {
  onAdd: (item: CartItem) => void
  /** Fullscreen cashier look — bigger bipe field, dark contrast. */
  variant?: 'default' | 'cashier'
}

export function ProductSearch({ onAdd, variant = 'default' }: ProductSearchProps) {
  const isCashier = variant === 'cashier'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  /** Product waiting for quantity confirmation. null = search mode. */
  const [staged, setStaged] = useState<{ product: Product; quantity: number } | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)
  const stagedQtyRef = useRef<HTMLInputElement>(null)
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([])
  const debouncedQuery = useDebounce(query, 300)
  const didStageRef = useRef(false)

  // Auto-focus search on mount + warm the local cache.
  useEffect(() => {
    searchRef.current?.focus()
    void ensureProductsCached()
  }, [])

  // Reset highlight whenever results change.
  useEffect(() => {
    setHighlightedIndex(-1)
    resultRefs.current = []
  }, [results])

  // Handle focus transitions after React commits the DOM.
  useEffect(() => {
    if (staged) {
      didStageRef.current = true
      requestAnimationFrame(() => {
        stagedQtyRef.current?.select()
        stagedQtyRef.current?.focus()
      })
    } else if (didStageRef.current) {
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [staged])

  // Name search — fuzzy match from offline cache.
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([])
      return
    }
    let cancelled = false
    setLoading(true)
    searchProducts(debouncedQuery)
      .then((data) => { if (!cancelled) setResults(data) })
      .catch(() => { if (!cancelled) setResults([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debouncedQuery])

  /** Move a product to the staging panel, clearing the search dropdown. */
  function stageProduct(product: Product) {
    setStaged({ product, quantity: 1 })
    setQuery('')
    setResults([])
  }

  /** Confirm the staged product: add to cart (focus returns via useEffect). */
  function confirmStaged() {
    if (!staged) return
    const { product, quantity } = staged
    if (product.track_stock && quantity > product.stock_quantity) {
      toast.error(`Estoque insuficiente. Disponível: ${product.stock_quantity}`)
      return
    }
    onAdd({ product, quantity })
    setStaged(null)
  }

  /** Cancel staging (focus returns via useEffect). */
  function cancelStaged() {
    setStaged(null)
  }

  function setStagedQty(value: number) {
    if (!staged) return
    const raw = Math.floor(value) || 1
    const clamped = staged.product.track_stock
      ? Math.max(1, Math.min(staged.product.stock_quantity, raw))
      : Math.max(1, raw)
    setStaged((prev) => (prev ? { ...prev, quantity: clamped } : null))
  }

  async function handleBarcodeLookup(code: string) {
    const trimmed = code.trim()
    if (!trimmed) return

    setScanning(true)
    let product: Product | null = null
    try {
      product = await getByCode(trimmed)
    } catch {
      setScanning(false)
      toast.error('Erro ao buscar produto. Tente novamente.')
      return
    }
    setScanning(false)

    if (!product) {
      toast.error(`Código não encontrado: ${trimmed}`)
      searchRef.current?.select()
      return
    }
    if (product.track_stock && product.stock_quantity <= 0) {
      toast.error(`Sem estoque: ${product.name}`)
      searchRef.current?.select()
      return
    }

    stageProduct(product)
  }

  function looksNumeric(value: string): boolean {
    return /^\d{4,}$/.test(value.trim())
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // ── Arrow navigation ──────────────────────────────────────
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (results.length === 0) return
      const next = Math.min(highlightedIndex + 1, results.length - 1)
      setHighlightedIndex(next)
      resultRefs.current[next]?.scrollIntoView({ block: 'nearest' })
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length === 0) return
      const next = Math.max(highlightedIndex - 1, 0)
      setHighlightedIndex(next)
      resultRefs.current[next]?.scrollIntoView({ block: 'nearest' })
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setResults([])
      setQuery('')
      return
    }

    // ── Enter ─────────────────────────────────────────────────
    if (e.key !== 'Enter') return
    e.preventDefault()
    const value = e.currentTarget.value.trim()
    if (!value) return

    if (looksNumeric(value)) {
      void handleBarcodeLookup(value)
      return
    }

    // Highlighted item takes priority; fall back to single result.
    if (highlightedIndex >= 0 && results[highlightedIndex]) {
      stageProduct(results[highlightedIndex])
    } else if (results.length === 1) {
      stageProduct(results[0])
    }
  }

  function handleStagedQtyKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmStaged()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelStaged()
    }
  }

  return (
    <div className="space-y-2">
      {/* ── Search input ── */}
      {isCashier ? (
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Código de barras
          </label>
          <div className="relative">
            <ScanBarcode
              aria-hidden="true"
              className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#234e7a]"
            />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Bipe o código ou digite o nome..."
              className="h-14 rounded-xl border-2 border-slate-200 bg-slate-50 pl-12 pr-4 text-lg font-semibold text-slate-900 placeholder:text-slate-400 focus-visible:border-[#234e7a] focus-visible:ring-[#234e7a]/20"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              aria-label="Buscar produto por código ou nome"
              aria-activedescendant={highlightedIndex >= 0 ? `result-${highlightedIndex}` : undefined}
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="product-results"
            />
          </div>
        </div>
      ) : (
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Bipe o código de barras OU digite o nome do produto..."
            className="pl-9 pr-10 h-11 text-sm"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            aria-label="Buscar produto por código ou nome"
            aria-activedescendant={highlightedIndex >= 0 ? `result-${highlightedIndex}` : undefined}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="product-results"
          />
          <ScanBarcode
            aria-hidden="true"
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
        </div>
      )}

      {/* ── Staged product: quantity confirmation ── */}
      {staged && (
        <div
          className={
            isCashier
              ? 'rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 space-y-3'
              : 'rounded-lg border-2 border-primary/60 bg-primary/5 dark:bg-primary/10 p-3 space-y-3 shadow-sm'
          }
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p
                className={`font-semibold ${
                  isCashier
                    ? 'text-base text-slate-900'
                    : 'text-sm text-slate-900 dark:text-slate-100 truncate'
                }`}
              >
                {staged.product.name}
              </p>
              <p
                className={`mt-0.5 ${
                  isCashier ? 'text-sm text-slate-500' : 'text-xs text-slate-500 dark:text-slate-400'
                }`}
              >
                Cód: {staged.product.code} · Estoque: {staged.product.stock_quantity} ·{' '}
                {formatCurrency(staged.product.sale_price)}
              </p>
            </div>
            <button
              type="button"
              onClick={cancelStaged}
              className={
                isCashier
                  ? 'shrink-0 text-slate-400 hover:text-slate-700 mt-0.5'
                  : 'shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mt-0.5'
              }
              aria-label="Cancelar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`shrink-0 font-medium ${
                isCashier ? 'text-sm text-slate-600' : 'text-xs text-slate-600 dark:text-slate-400'
              }`}
            >
              Quantidade:
            </span>

            <div
              className={`inline-flex items-center overflow-hidden rounded-md border ${
                isCashier
                  ? 'border-slate-300 bg-white'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800'
              }`}
            >
              <button
                type="button"
                onClick={() => setStagedQty(staged.quantity - 1)}
                disabled={staged.quantity <= 1}
                className={`h-9 w-9 inline-flex items-center justify-center disabled:opacity-40 transition-colors ${
                  isCashier
                    ? 'text-slate-700 hover:bg-slate-100'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/8'
                }`}
                aria-label="Diminuir"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                ref={stagedQtyRef}
                type="number"
                min={1}
                max={staged.product.track_stock ? staged.product.stock_quantity : undefined}
                value={staged.quantity}
                onChange={(e) => setStagedQty(parseInt(e.target.value, 10) || 1)}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={handleStagedQtyKeyDown}
                className={`w-14 h-9 text-center text-base font-bold tabular-nums border-x focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                  isCashier
                    ? 'text-slate-900 bg-white border-slate-200 focus:bg-emerald-50'
                    : 'text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border-slate-200 dark:border-white/10 focus:bg-primary/10 dark:focus:bg-primary/20'
                }`}
                aria-label="Quantidade"
              />
              <button
                type="button"
                onClick={() => setStagedQty(staged.quantity + 1)}
                disabled={
                  staged.product.track_stock &&
                  staged.quantity >= staged.product.stock_quantity
                }
                className={`h-9 w-9 inline-flex items-center justify-center disabled:opacity-40 transition-colors ${
                  isCashier
                    ? 'text-slate-700 hover:bg-slate-100'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/8'
                }`}
                aria-label="Aumentar"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <Button
              size="sm"
              className="h-9 flex-1 bg-emerald-500 font-semibold text-white hover:bg-emerald-400 sm:flex-initial"
              onClick={confirmStaged}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Adicionar{' '}
              <span className="ml-1 hidden text-xs font-normal text-emerald-50 sm:inline">
                ↵ Enter
              </span>
            </Button>
          </div>

          <p className={`text-[11px] font-medium ${isCashier ? 'text-emerald-800' : 'text-primary'}`}>
            Digite a quantidade e pressione <strong>Enter</strong> · <strong>Esc</strong> para cancelar
          </p>
        </div>
      )}

      {/* ── Hints (only in search mode, no results open) ── */}
      {!staged && results.length === 0 && !isCashier && (
        <div className="px-1 space-y-1 text-[11px] text-slate-400 dark:text-slate-500">
          <p>
            <ScanBarcode aria-hidden="true" className="inline h-3 w-3 mr-1 -mt-0.5 text-slate-400 dark:text-slate-500" />
            <strong className="text-slate-600 dark:text-slate-300">Com código:</strong> bipe → confirme a quantidade → <kbd className="px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] dark:bg-slate-700 dark:text-slate-300">Enter</kbd>
          </p>
          <p>
            <Search aria-hidden="true" className="inline h-3 w-3 mr-1 -mt-0.5 text-slate-400 dark:text-slate-500" />
            <strong className="text-slate-600 dark:text-slate-300">Sem código:</strong> digite → <kbd className="px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] dark:bg-slate-700 dark:text-slate-300">↓</kbd> para navegar → <kbd className="px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] dark:bg-slate-700 dark:text-slate-300">Enter</kbd> para selecionar
          </p>
        </div>
      )}

      {(loading || scanning) && (
        <p className={`px-1 text-xs ${isCashier ? 'text-slate-500' : 'text-slate-400'}`}>
          {scanning ? 'Lendo código...' : 'Buscando...'}
        </p>
      )}

      {/* ── Search results dropdown ── */}
      {results.length > 0 && !staged && (
        <div
          id="product-results"
          role="listbox"
          className={
            isCashier
              ? 'max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 shadow-lg'
              : 'border border-slate-200 dark:border-white/8 rounded-lg divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-slate-800 shadow-sm max-h-48 sm:max-h-64 overflow-y-auto'
          }
        >
          {results.map((product, index) => (
            <button
              key={product.id}
              id={`result-${index}`}
              ref={(el) => { resultRefs.current[index] = el }}
              type="button"
              role="option"
              aria-selected={index === highlightedIndex}
              className={`w-full text-left flex items-center justify-between gap-3 px-4 py-2.5 transition-colors focus:outline-none ${
                isCashier
                  ? index === highlightedIndex
                    ? 'bg-emerald-50 border-l-2 border-l-emerald-500'
                    : 'hover:bg-slate-50'
                  : index === highlightedIndex
                    ? 'bg-primary/5 dark:bg-primary/15 border-l-2 border-l-blue-500'
                    : 'hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
              onClick={() => stageProduct(product)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p
                    className={`text-sm font-medium ${
                      isCashier
                        ? index === highlightedIndex
                          ? 'text-emerald-900 font-semibold'
                          : 'text-slate-900'
                        : index === highlightedIndex
                          ? 'text-primary/80 dark:text-primary truncate'
                          : 'text-slate-900 dark:text-slate-100 truncate'
                    }`}
                  >
                    {product.name}
                  </p>
                  {product.track_stock && product.stock_quantity <= 0 && (
                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                      Sem estoque
                    </span>
                  )}
                </div>
                <p className={`text-xs ${isCashier ? 'text-slate-500' : 'text-slate-500 dark:text-slate-400'}`}>
                  Cód: {product.code} · Estoque: {product.stock_quantity} ·{' '}
                  {formatCurrency(product.sale_price)}
                </p>
              </div>
              <span
                className={`shrink-0 text-[11px] hidden sm:block ${
                  isCashier ? 'text-slate-400' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {index === highlightedIndex ? (
                  <span className={isCashier ? 'text-emerald-700 font-medium' : 'text-primary/80 dark:text-primary font-medium'}>
                    ↵ Enter
                  </span>
                ) : (
                  'clique ou ↓'
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {results.length > 1 && !staged && !isCashier && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1">
          <kbd className="px-1 py-0.5 rounded bg-slate-100 text-slate-500 font-mono text-[10px] dark:bg-slate-700 dark:text-slate-300">↓ ↑</kbd> navegar ·{' '}
          <kbd className="px-1 py-0.5 rounded bg-slate-100 text-slate-500 font-mono text-[10px] dark:bg-slate-700 dark:text-slate-300">Enter</kbd> selecionar ·{' '}
          <kbd className="px-1 py-0.5 rounded bg-slate-100 text-slate-500 font-mono text-[10px] dark:bg-slate-700 dark:text-slate-300">Esc</kbd> fechar
        </p>
      )}

      {!loading && !scanning && !staged && query && results.length === 0 && (
        <p className={`px-1 text-sm ${isCashier ? 'text-slate-500' : 'text-slate-400'}`}>
          Nenhum produto encontrado em estoque.
        </p>
      )}
    </div>
  )
}
