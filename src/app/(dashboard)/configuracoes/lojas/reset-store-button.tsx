'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resetStoreOperations } from './actions'

export function ResetStoreButton({
  storeId,
  storeName,
}: {
  storeId: string
  storeName: string
}) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    if (
      !confirm(
        `Zerar vendas e fiado de "${storeName}"?\n\nO catálogo de produtos permanece. Esta ação não tem volta.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await resetStoreOperations(storeId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Histórico operacional zerado.')
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
      )}
      Zerar vendas
    </Button>
  )
}
