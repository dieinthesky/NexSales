'use client'

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Save, X, ScanBarcode, TrendingUp, TrendingDown, ImagePlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { productSchema, type ProductFormData } from '@/lib/validations/product.schema'
import {
  lookupProductByBarcode,
  fetchProductImage,
} from '@/app/(dashboard)/produtos/actions'
import type { Category, Product } from '@/types/database'

const SOURCE_LABELS: Record<string, string> = {
  cosmos: 'Cosmos (Bluesoft)',
  openfoodfacts: 'Open Food Facts',
  openproductsfacts: 'Open Products Facts',
  openbeautyfacts: 'Open Beauty Facts',
  upcitemdb: 'UPCitemdb',
}

// ── Currency input (ATM-style) ──────────────────────────────────────────────
// Digits only; last 2 are always the decimal cents.
// "2" → "0,02" | "250" → "2,50" | "25000" → "250,00" | "2500000" → "25.000,00"

function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface CurrencyInputProps {
  id: string
  value: number
  onChange: (value: number) => void
  placeholder?: string
  hasError?: boolean
  disabled?: boolean
}

function CurrencyInput({ id, value, onChange, placeholder = '0,00', hasError, disabled }: CurrencyInputProps) {
  const initialCents = Math.round((value || 0) * 100)
  const [display, setDisplay] = useState(initialCents > 0 ? centsToBRL(initialCents) : '')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '')
    if (!digits) {
      setDisplay('')
      onChange(0)
      return
    }
    const cents = parseInt(digits, 10)
    setDisplay(centsToBRL(cents))
    onChange(cents / 100)
  }

  return (
    <Input
      id={id}
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      aria-invalid={hasError}
      className="h-10 border-slate-200 dark:border-white/10"
    />
  )
}
// ───────────────────────────────────────────────────────────────────────────

interface ProductFormProps {
  product?: Product
  categories: Category[]
  onSubmit: (formData: FormData) => Promise<{ error?: string } | undefined>
}

export function ProductForm({ product, categories, onSubmit }: ProductFormProps) {
  const [isPending, startTransition] = useTransition()
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(product?.image_url ?? null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? '')
  const [removeImage, setRemoveImage] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const isNew = !product

  const nameInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    control,
    formState: { errors },
  } = useForm<ProductFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(productSchema) as any,
    defaultValues: product
      ? {
          code: product.code,
          name: product.name,
          description: product.description ?? '',
          sale_price: product.sale_price,
          cost_price: product.cost_price,
          stock_quantity: product.stock_quantity,
          min_stock: product.min_stock,
          category_id: product.category_id ?? '',
          track_stock: product.track_stock,
        }
      : { stock_quantity: 0, min_stock: 0, cost_price: 0, sale_price: 0, track_stock: true },
  })

  const watchedSalePrice = useWatch({ control, name: 'sale_price' })
  const watchedCostPrice = useWatch({ control, name: 'cost_price' })
  const trackStock = useWatch({ control, name: 'track_stock' }) as boolean

  const saleNum = Number(watchedSalePrice) || 0
  const costNum = Number(watchedCostPrice) || 0
  const profitValue = saleNum - costNum
  // Margem: quanto % do preço de venda é lucro ("de cada R$100 vendidos, X é lucro")
  const marginPct = saleNum > 0 ? (profitValue / saleNum) * 100 : null
  // % sobre o custo: quanto acima do preço de custo está o preço de venda
  const overCostPct = costNum > 0 ? (profitValue / costNum) * 100 : null
  const showMargin = saleNum > 0 && costNum > 0

  // Resolve refs by composing react-hook-form's ref with our local refs.
  const codeRegister = register('code')
  const nameRegister = register('name')
  const codeInputRef = useRef<HTMLInputElement | null>(null)

  // Auto-focus the code field on mount so the USB scanner targets it directly
  useEffect(() => {
    if (isNew) {
      codeInputRef.current?.focus()
    }
  }, [isNew])

  // Produto já cadastrado sem foto: tenta buscar no Open Food Facts automaticamente
  useEffect(() => {
    if (!product?.id || product.image_url || !/^\d{8,14}$/.test(product.code)) return
    let cancelled = false
    void fetchProductImage(product.id).then((result) => {
      if (cancelled || !result.imageUrl) return
      setImagePreview(result.imageUrl)
      setImageUrl(result.imageUrl)
      setRemoveImage(false)
      toast.success('Foto encontrada e salva no produto')
    })
    return () => {
      cancelled = true
    }
  }, [product?.id, product?.image_url, product?.code])

  function looksLikeBarcode(code: string): boolean {
    return /^\d{8,14}$/.test(code)
  }

  async function runBarcodeLookup(code: string) {
    const trimmed = code.trim()
    if (!trimmed || !isNew) {
      nameInputRef.current?.focus()
      return
    }

    const isBarcode = looksLikeBarcode(trimmed)

    setIsLookingUp(true)
    try {
      const result = await lookupProductByBarcode(trimmed)

      if (result.status === 'already_registered') {
        toast.warning(
          result.inactive
            ? `Código inativo: ${result.name}. Reative o produto para usar de novo.`
            : `Já cadastrado: ${result.name}`,
          {
            action: {
              label: result.inactive ? 'Reativar' : 'Abrir',
              onClick: () => router.push(`/produtos/${result.productId}`),
            },
          },
        )
        return
      }

      if (result.status === 'found_external') {
        setValue('name', result.name, { shouldValidate: true })
        if (result.description) {
          setValue('description', result.description, { shouldValidate: true })
        }
        if (result.imageUrl) {
          setImageUrl(result.imageUrl)
          setImagePreview(result.imageUrl)
          setImageFile(null)
          setRemoveImage(false)
        }
        const label = SOURCE_LABELS[result.source] ?? result.source
        toast.success(
          result.imageUrl
            ? `Produto encontrado em ${label} (com foto)`
            : `Produto encontrado em ${label}`,
        )
        nameInputRef.current?.focus()
        nameInputRef.current?.select()
        return
      }

      if (result.status === 'error') {
        toast.error(result.message)
        nameInputRef.current?.focus()
        return
      }

      if (isBarcode) {
        toast.info('Código não encontrado. Preencha os dados manualmente.')
      }
      nameInputRef.current?.focus()
    } finally {
      setIsLookingUp(false)
    }
  }

  function handleCodeKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void runBarcodeLookup(e.currentTarget.value)
    }
  }

  function handleCodeBlur(e: FocusEvent<HTMLInputElement>) {
    if (isNew && e.currentTarget.value.trim()) {
      void runBarcodeLookup(e.currentTarget.value)
    }
  }

  function handleImagePick(file: File | null) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A foto deve ter no máximo 5 MB.')
      return
    }
    setImageFile(file)
    setImageUrl('')
    setRemoveImage(false)
    setImagePreview(URL.createObjectURL(file))
  }

  function clearImage() {
    setImageFile(null)
    setImageUrl('')
    setImagePreview(null)
    setRemoveImage(true)
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  function handleFormSubmit(data: ProductFormData) {
    startTransition(async () => {
      const formData = new FormData()
      Object.entries(data).forEach(([k, v]) => {
        if (v !== null && v !== undefined) formData.set(k, String(v))
      })
      if (imageFile) formData.set('image', imageFile)
      if (imageUrl) formData.set('image_url', imageUrl)
      if (removeImage) formData.set('remove_image', '1')

      const result = await onSubmit(formData)
      if (result?.error) {
        if (result.error === 'Código de produto já existe.') {
          setError('code', { message: result.error })
          codeInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          codeInputRef.current?.focus()
        }
        toast.error(result.error)
      }
    })
  }

  return (
    <Card className="max-w-2xl border-slate-200/80 dark:border-white/8 shadow-sm">
      <CardHeader className="bg-slate-50/60 dark:bg-slate-800/60 border-b border-slate-100 dark:border-white/8 pb-3">
        <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {product ? 'Dados do produto' : 'Informações do produto'}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="code" className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ScanBarcode className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                Código <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="code"
                  placeholder="EX-001 ou aponte o leitor"
                  autoComplete="off"
                  spellCheck={false}
                  required
                  aria-invalid={!!errors.code}
                  className="h-10 border-slate-200 dark:border-white/10 pr-9"
                  {...codeRegister}
                  ref={(el) => {
                    codeRegister.ref(el)
                    codeInputRef.current = el
                  }}
                  onKeyDown={handleCodeKeyDown}
                  onBlur={(e) => {
                    codeRegister.onBlur(e)
                    handleCodeBlur(e)
                  }}
                  disabled={isLookingUp}
                />
                {isLookingUp ? (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/80 animate-spin" />
                ) : (
                  <ScanBarcode className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 dark:text-slate-600 pointer-events-none" />
                )}
              </div>
              {isNew && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Ao escanear ou pressionar Enter, buscamos nome e descrição automaticamente.
                </p>
              )}
              {errors.code && (
                <p className="text-red-500 text-xs">{errors.code.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Nome <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Nome do produto"
                required
                aria-invalid={!!errors.name}
                className="h-10 border-slate-200 dark:border-white/10"
                {...nameRegister}
                ref={(el) => {
                  nameRegister.ref(el)
                  nameInputRef.current = el
                }}
              />
              {errors.name && (
                <p className="text-red-500 text-xs">{errors.name.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Foto do produto
            </Label>
            <div className="flex items-start gap-3">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-800">
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="Prévia" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-7 w-7 text-slate-300" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                  onChange={(e) => handleImagePick(e.target.files?.[0] ?? null)}
                />
                <p className="text-[11px] text-slate-400">
                  JPG/PNG/WEBP até 5 MB. No bipe, se achar foto na base, já preenche.
                </p>
                <div className="flex flex-wrap gap-3">
                  {product && !imagePreview && /^\d{8,14}$/.test(product.code) && (
                    <button
                      type="button"
                      onClick={() => {
                        startTransition(async () => {
                          const result = await fetchProductImage(product.id)
                          if (result.error) {
                            toast.error(result.error)
                            return
                          }
                          if (result.imageUrl) {
                            setImagePreview(result.imageUrl)
                            setImageUrl(result.imageUrl)
                            setRemoveImage(false)
                            toast.success('Foto encontrada!')
                          }
                        })
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#234e7a] hover:underline"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      Buscar foto pelo código
                    </button>
                  )}
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={clearImage}
                      className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover foto
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Descrição
            </Label>
            <Input
              id="description"
              placeholder="Descrição opcional"
              className="h-10 border-slate-200 dark:border-white/10"
              {...register('description')}
            />
            {errors.description && (
              <p className="text-red-500 text-xs">{errors.description.message}</p>
            )}
          </div>

          {/* ── Prices ── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sale_price" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Preço de Venda (R$) <span className="text-red-500">*</span>
              </Label>
              <Controller
                control={control}
                name="sale_price"
                render={({ field }) => (
                  <CurrencyInput
                    id="sale_price"
                    value={field.value as number}
                    onChange={field.onChange}
                    hasError={!!errors.sale_price}
                  />
                )}
              />
              {errors.sale_price && (
                <p className="text-red-500 text-xs">{errors.sale_price.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cost_price" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Preço de Custo (R$) <span className="text-red-500">*</span>
              </Label>
              <Controller
                control={control}
                name="cost_price"
                render={({ field }) => (
                  <CurrencyInput
                    id="cost_price"
                    value={field.value as number}
                    onChange={field.onChange}
                    hasError={!!errors.cost_price}
                  />
                )}
              />
              {errors.cost_price && (
                <p className="text-red-500 text-xs">{errors.cost_price.message}</p>
              )}
            </div>
          </div>

          {/* ── Live margin feedback ── */}
          {showMargin && (
            <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-4 py-2.5 text-sm border ${
              profitValue >= 0
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-300'
            }`}>
              {profitValue >= 0
                ? <TrendingUp className="h-4 w-4 shrink-0" />
                : <TrendingDown className="h-4 w-4 shrink-0" />
              }
              <span className="font-medium">
                Lucro por unidade:{' '}
                <strong>
                  R$ {Math.abs(profitValue).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {profitValue < 0 && ' (prejuízo)'}
                </strong>
              </span>
              <span className="text-xs opacity-80 flex gap-3">
                {marginPct !== null && (
                  <span>
                    Margem: <strong>{marginPct.toFixed(1)}%</strong>
                    <span className="font-normal opacity-70"> da venda</span>
                  </span>
                )}
                {overCostPct !== null && (
                  <span>
                    Ganho s/ custo: <strong>{overCostPct.toFixed(1)}%</strong>
                  </span>
                )}
              </span>
            </div>
          )}

          {/* ── Stock control toggle ── */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-slate-800/40 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Controlar estoque</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Quando desativado, não limita nem desconta estoque nas vendas
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={trackStock ?? true}
              onClick={() => setValue('track_stock', !(trackStock ?? true))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                (trackStock ?? true) ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                  (trackStock ?? true) ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {(trackStock ?? true) && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="stock_quantity" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Estoque Atual <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="stock_quantity"
                  type="number"
                  min="0"
                  placeholder="0"
                  required
                  aria-invalid={!!errors.stock_quantity}
                  className="h-10 border-slate-200 dark:border-white/10"
                  {...register('stock_quantity')}
                />
                {errors.stock_quantity && (
                  <p className="text-red-500 text-xs">{errors.stock_quantity.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="min_stock" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Estoque Mínimo <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="min_stock"
                  type="number"
                  min="0"
                  placeholder="0"
                  required
                  aria-invalid={!!errors.min_stock}
                  className="h-10 border-slate-200 dark:border-white/10"
                  {...register('min_stock')}
                />
                {errors.min_stock && (
                  <p className="text-red-500 text-xs">{errors.min_stock.message}</p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">Categoria</Label>
            <Select
              defaultValue={product?.category_id ?? '__none__'}
              onValueChange={(v) => setValue('category_id', v === '__none__' ? '' : v)}
            >
              <SelectTrigger className="h-10 border-slate-200 dark:border-white/10">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem categoria</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-2 border-t border-slate-100 dark:border-white/8">
            <Button
              type="submit"
              disabled={isPending}
              className="bg-primary hover:bg-primary/90 text-white shadow-sm"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {product ? 'Salvar Alterações' : 'Cadastrar Produto'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              onClick={() => router.back()}
            >
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
