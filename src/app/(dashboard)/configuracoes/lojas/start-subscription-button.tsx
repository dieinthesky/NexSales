'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { startStoreSubscription } from './actions'

export function StartSubscriptionButton({
  storeId,
  storeName,
  disabled,
}: {
  storeId: string
  storeName: string
  disabled?: boolean
}) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (disabled) return
    setLoading(true)
    const result = await startStoreSubscription(storeId)
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(`Assinatura liberada: ${storeName} (R$ 60 nos 3 primeiros meses)`)
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || loading}
      onClick={() => void handleClick()}
      className="text-xs"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Liberar assinatura'}
    </Button>
  )
}
