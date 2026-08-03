'use client'

import { useCallback, useEffect, useState } from 'react'
import { Cloud, CloudOff, HardDrive, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  formatLastSync,
  getLocalCatalogStatus,
  pullCatalogIfOnline,
  type LocalCatalogStatus,
} from '@/lib/offline/catalog-status'
import { mayUseNetwork } from '@/lib/offline/network'
import { cn } from '@/lib/utils/cn'

interface CatalogReadyBarProps {
  /** Chamado quando o catálogo fica ready (ou muda status) */
  onStatus?: (status: LocalCatalogStatus) => void
  className?: string
}

/**
 * Barra do caixa: quantos produtos no cache local + último sync + botão atualizar.
 */
export function CatalogReadyBar({ onStatus, className }: CatalogReadyBarProps) {
  const [status, setStatus] = useState<LocalCatalogStatus | null>(null)
  const [pulling, setPulling] = useState(false)

  const refresh = useCallback(async () => {
    const s = await getLocalCatalogStatus()
    setStatus(s)
    onStatus?.(s)
  }, [onStatus])

  useEffect(() => {
    void refresh()
    const onNet = () => void refresh()
    window.addEventListener('online', onNet)
    window.addEventListener('offline', onNet)
    const id = window.setInterval(() => void refresh(), 30_000)
    return () => {
      window.removeEventListener('online', onNet)
      window.removeEventListener('offline', onNet)
      window.clearInterval(id)
    }
  }, [refresh])

  async function handlePull() {
    if (!mayUseNetwork()) return
    setPulling(true)
    try {
      const s = await pullCatalogIfOnline()
      setStatus(s)
      onStatus?.(s)
    } finally {
      setPulling(false)
    }
  }

  if (!status) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 text-[11px] text-blue-100/70',
          className,
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Checando catálogo local…
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 bg-[#183450] px-3 py-1.5 text-[11px] text-blue-50/90 sm:px-4',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5 font-medium">
        <HardDrive className="h-3.5 w-3.5 opacity-80" aria-hidden />
        Catálogo local:{' '}
        <strong className="tabular-nums text-white">
          {status.productCount}
        </strong>{' '}
        {status.productCount === 1 ? 'produto' : 'produtos'}
      </span>
      <span className="opacity-70">
        Sync: {formatLastSync(status.lastSyncAt)}
      </span>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
          status.online
            ? 'bg-emerald-500/20 text-emerald-200'
            : 'bg-amber-500/25 text-amber-100',
        )}
      >
        {status.online ? (
          <>
            <Cloud className="h-3 w-3" /> Online
          </>
        ) : (
          <>
            <CloudOff className="h-3 w-3" /> Offline · cache
          </>
        )}
      </span>
      {status.online && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pulling}
          onClick={() => void handlePull()}
          className="ml-auto h-7 gap-1 px-2 text-[11px] text-blue-100 hover:bg-white/10 hover:text-white"
        >
          {pulling ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Atualizar catálogo
        </Button>
      )}
    </div>
  )
}
