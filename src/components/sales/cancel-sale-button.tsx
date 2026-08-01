'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cancelSale } from '@/app/(dashboard)/vendas/actions'

interface CancelSaleButtonProps {
  saleId: string
  /** Short human-readable id (e.g. last 8 chars) shown in the modal. */
  shortId: string
  /** Ícone só — para a lista do histórico. */
  compact?: boolean
}

/**
 * Admin-only "Excluir venda" button on the sale detail page.
 *
 * Opens an inline confirmation modal that explicitly warns the user about
 * stock restoration before allowing the destructive action to run.
 */
export function CancelSaleButton({ saleId, shortId, compact = false }: CancelSaleButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleConfirm() {
    startTransition(async () => {
      const result = await cancelSale(saleId)
      if (result.success) {
        toast.success('Venda excluída. Estoque devolvido aos produtos.')
        setIsOpen(false)
        if (!compact) {
          router.push('/vendas')
        }
        router.refresh()
      } else {
        toast.error(result.error ?? 'Não foi possível excluir a venda.')
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant={compact ? 'ghost' : 'outline'}
        size={compact ? 'sm' : 'default'}
        className={
          compact
            ? 'text-red-600 dark:text-red-400 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-500/10'
            : 'border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 hover:border-red-300'
        }
        onClick={() => setIsOpen(true)}
        title="Excluir venda"
      >
        <Trash2 className={compact ? 'h-4 w-4' : 'mr-1.5 h-4 w-4'} />
        {compact ? null : 'Excluir venda'}
      </Button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-sale-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setIsOpen(false)
          }}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden ring-1 ring-slate-200">
            <div className="px-6 py-5 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="cancel-sale-title"
                    className="text-base font-semibold text-slate-900"
                  >
                    Excluir venda #{shortId}?
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Esta ação não pode ser desfeita.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-amber-50/60 border-b border-amber-100">
              <p className="text-sm text-amber-900 leading-relaxed">
                Ao excluir esta venda:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-900">
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-600 mt-0.5">•</span>
                  Os produtos vendidos serão{' '}
                  <strong>devolvidos ao estoque</strong>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-600 mt-0.5">•</span>
                  Os totais do dia/mês serão recalculados
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-600 mt-0.5">•</span>
                  O histórico não terá registro dessa venda
                </li>
              </ul>
            </div>

            <div className="px-6 py-4 flex items-center justify-end gap-2 bg-slate-50/30">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                disabled={isPending}
                className="text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="bg-red-600 hover:bg-red-700 text-white shadow-sm"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Excluir definitivamente
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
