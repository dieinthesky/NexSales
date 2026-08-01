'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Camera,
  CheckCircle2,
  Loader2,
  PackagePlus,
  ScanBarcode,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  lookupProductByBarcode,
  setProductStock,
  createProductFromVisit,
  type VisitProductResult,
} from '@/app/(dashboard)/produtos/actions'
import {
  BarcodeCameraScanner,
  canUseBarcodeCamera,
} from '@/components/products/barcode-camera-scanner'
import { formatCurrency } from '@/lib/utils/format'
import type { Category } from '@/types/database'

type Stage =
  | { kind: 'idle' }
  | { kind: 'looking' }
  | {
      kind: 'existing'
      productId: string
      code: string
      name: string
      inactive?: boolean
      stock: number
      salePrice: number
    }
  | {
      kind: 'new'
      code: string
      name: string
      description: string
      imageUrl: string | null
      salePrice: string
      stock: string
      categoryId: string
      sourceHint?: string
    }

interface SessionItem extends VisitProductResult {
  at: string
  mode: 'created' | 'stock'
}

const SOURCE_LABELS: Record<string, string> = {
  cosmos: 'Cosmos',
  openfoodfacts: 'Open Food Facts',
  openproductsfacts: 'Open Products Facts',
  openbeautyfacts: 'Open Beauty Facts',
  upcitemdb: 'UPCitemdb',
}

interface VisitaInventarioProps {
  categories: Category[]
}

export function VisitaInventario({ categories }: VisitaInventarioProps) {
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [session, setSession] = useState<SessionItem[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraOk, setCameraOk] = useState(false)
  const [pending, startTransition] = useTransition()
  const codeRef = useRef<HTMLInputElement>(null)
  const stockRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setCameraOk(canUseBarcodeCamera())
    codeRef.current?.focus()
  }, [])

  useEffect(() => {
    if (stage.kind === 'existing' || stage.kind === 'new') {
      requestAnimationFrame(() => stockRef.current?.select())
    }
  }, [stage])

  const resetToScan = useCallback(() => {
    setStage({ kind: 'idle' })
    setCode('')
    requestAnimationFrame(() => codeRef.current?.focus())
  }, [])

  const pushSession = useCallback((product: VisitProductResult, mode: 'created' | 'stock') => {
    setSession((prev) => [
      { ...product, at: new Date().toISOString(), mode },
      ...prev,
    ].slice(0, 40))
  }, [])

  const resolveCode = useCallback((raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return

    setCode(trimmed)
    setCameraOpen(false)
    setStage({ kind: 'looking' })

    startTransition(async () => {
      const result = await lookupProductByBarcode(trimmed)

      if (result.status === 'error') {
        toast.error(result.message)
        setStage({ kind: 'idle' })
        return
      }

      if (result.status === 'already_registered') {
        setStage({
          kind: 'existing',
          productId: result.productId,
          code: trimmed,
          name: result.name,
          inactive: result.inactive,
          stock: result.stock_quantity ?? 0,
          salePrice: result.sale_price ?? 0,
        })
        return
      }

      if (result.status === 'found_external') {
        setStage({
          kind: 'new',
          code: trimmed,
          name: result.name,
          description: result.description ?? '',
          imageUrl: result.imageUrl ?? null,
          salePrice: '',
          stock: '1',
          categoryId: '',
          sourceHint: SOURCE_LABELS[result.source] ?? result.source,
        })
        return
      }

      setStage({
        kind: 'new',
        code: trimmed,
        name: '',
        description: '',
        imageUrl: null,
        salePrice: '',
        stock: '1',
        categoryId: '',
      })
      toast.message('Código não encontrado nas bases. Preencha nome e preço.')
    })
  }, [])

  function handleCodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    resolveCode(code)
  }

  function handleCameraDetect(value: string) {
    resolveCode(value)
  }

  function saveExisting() {
    if (stage.kind !== 'existing') return
    const qty = Number(stage.stock)
    if (!Number.isInteger(qty) || qty < 0) {
      toast.error('Informe uma quantidade inteira válida.')
      return
    }

    startTransition(async () => {
      const result = await setProductStock(stage.productId, qty)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      pushSession(result.product, 'stock')
      toast.success(`Estoque de ${result.product.name}: ${result.product.stock_quantity} un.`)
      resetToScan()
    })
  }

  function saveNew() {
    if (stage.kind !== 'new') return
    const name = stage.name.trim()
    if (name.length < 2) {
      toast.error('Informe o nome do produto.')
      return
    }
    const sale = Number(String(stage.salePrice).replace(',', '.'))
    const qty = Number(stage.stock)
    if (!Number.isFinite(sale) || sale < 0) {
      toast.error('Preço de venda inválido.')
      return
    }
    if (!Number.isInteger(qty) || qty < 0) {
      toast.error('Estoque inválido.')
      return
    }

    startTransition(async () => {
      const result = await createProductFromVisit({
        code: stage.code,
        name,
        sale_price: sale,
        stock_quantity: qty,
        description: stage.description || null,
        category_id: stage.categoryId || null,
        image_url: stage.imageUrl,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      pushSession(result.product, 'created')
      toast.success(`Cadastrado: ${result.product.name} · ${result.product.stock_quantity} un.`)
      resetToScan()
    })
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 pb-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <Label htmlFor="visita-code" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Código de barras
        </Label>
        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="visita-code"
              ref={codeRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={handleCodeKeyDown}
              placeholder="Bipe ou digite e Enter"
              inputMode="numeric"
              autoComplete="off"
              className="h-12 pl-10 text-base"
              disabled={pending || stage.kind === 'looking'}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-12 shrink-0 px-3"
            onClick={() => setCameraOpen(true)}
            disabled={pending}
            title={cameraOk ? 'Abrir câmera' : 'Câmera (se o navegador permitir)'}
          >
            <Camera className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            className="h-12 shrink-0"
            onClick={() => resolveCode(code)}
            disabled={pending || !code.trim()}
          >
            {stage.kind === 'looking' || pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Buscar'
            )}
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Salva direto no sistema. No .exe do cliente aparece após o sync.
        </p>
      </div>

      {stage.kind === 'looking' && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Consultando código…
        </div>
      )}

      {stage.kind === 'existing' && (
        <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Já cadastrado{stage.inactive ? ' (inativo — será reativado)' : ''}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">
              {stage.name}
            </h2>
            <p className="text-sm text-slate-500">{stage.code}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Preço atual: {formatCurrency(stage.salePrice)} · Estoque atual: {stage.stock} un.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="visita-stock-existing">Quantidade em estoque</Label>
            <Input
              id="visita-stock-existing"
              ref={stockRef}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className="h-12 text-lg"
              value={stage.stock}
              onChange={(e) =>
                setStage({ ...stage, stock: Number(e.target.value || 0) })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  saveExisting()
                }
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={resetToScan} disabled={pending}>
              Cancelar
            </Button>
            <Button type="button" className="flex-1" onClick={saveExisting} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar estoque'}
            </Button>
          </div>
        </div>
      )}

      {stage.kind === 'new' && (
        <div className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50/40 p-4 dark:border-sky-500/30 dark:bg-sky-500/10">
          <div className="flex items-start gap-2">
            <PackagePlus className="mt-0.5 h-5 w-5 text-sky-600 dark:text-sky-400" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
                Novo produto
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Código {stage.code}
                {stage.sourceHint ? ` · achado em ${stage.sourceHint}` : ''}
              </p>
            </div>
          </div>

          {stage.imageUrl ? (
            <img
              src={stage.imageUrl}
              alt=""
              className="mx-auto h-28 w-28 rounded-xl bg-white object-contain"
            />
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="visita-name">Nome</Label>
            <Input
              id="visita-name"
              className="h-11"
              value={stage.name}
              onChange={(e) => setStage({ ...stage, name: e.target.value })}
              placeholder="Nome do produto"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="visita-price">Preço de venda (R$)</Label>
              <Input
                id="visita-price"
                className="h-11"
                inputMode="decimal"
                placeholder="0,00"
                value={stage.salePrice}
                onChange={(e) => setStage({ ...stage, salePrice: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="visita-stock-new">Estoque</Label>
              <Input
                id="visita-stock-new"
                ref={stockRef}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="h-11"
                value={stage.stock}
                onChange={(e) => setStage({ ...stage, stock: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    saveNew()
                  }
                }}
              />
            </div>
          </div>

          {categories.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="visita-cat">Categoria (opcional)</Label>
              <select
                id="visita-cat"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={stage.categoryId}
                onChange={(e) => setStage({ ...stage, categoryId: e.target.value })}
              >
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={resetToScan} disabled={pending}>
              Cancelar
            </Button>
            <Button type="button" className="flex-1" onClick={saveNew} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cadastrar + estoque'}
            </Button>
          </div>
        </div>
      )}

      {session.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Nesta visita ({session.length})
          </h3>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/10">
            {session.map((item) => (
              <li key={`${item.id}-${item.at}`} className="flex items-start gap-2 py-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {item.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.code} · {item.stock_quantity} un. · {formatCurrency(item.sale_price)} ·{' '}
                    {item.mode === 'created' ? 'novo' : 'estoque'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <BarcodeCameraScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onDetect={handleCameraDetect}
      />
    </div>
  )
}
