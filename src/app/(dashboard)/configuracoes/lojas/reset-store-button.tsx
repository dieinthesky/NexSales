'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resetStoreOperations } from './actions'

export function ResetStoreButton({
  storeId,
  storeName,
  isTemplate = false,
}: {
  storeId: string
  storeName: string
  isTemplate?: boolean
}) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    const detail = isTemplate
      ? `Limpar histórico de vendas/fiado do catálogo modelo "${storeName}"?\n\nProdutos do modelo permanecem.`
      : `Resetar loja "${storeName}"?\n\nVai apagar:\n• todas as vendas / histórico\n• fiado e pagamentos\n• clientes\n• estoque volta a 0\n\nProdutos e categorias permanecem.\nEsta ação não tem volta.`

    if (!confirm(detail)) return

    startTransition(async () => {
      const result = await resetStoreOperations(storeId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(
        isTemplate ? 'Histórico do modelo limpo.' : 'Loja resetada — cliente pode começar do zero.',
      )
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      className={
        isTemplate
          ? undefined
          : 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10'
      }
    >
      {pending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
      )}
      {isTemplate ? 'Limpar histórico' : 'Resetar loja'}
    </Button>
  )
}
