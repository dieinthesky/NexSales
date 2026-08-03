'use client'

/**
 * Indicador de rede. Mensagem honesta:
 * - offline com cache: "Sem internet — operando com dados deste PC"
 * - não promete cache se o status for desconhecido
 */
import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { getLocalCatalogStatus } from '@/lib/offline/catalog-status'

export function OfflineIndicator() {
  const [online, setOnline] = useState(true)
  const [productCount, setProductCount] = useState<number | null>(null)

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine)
      void getLocalCatalogStatus().then((s) => setProductCount(s.productCount))
    }
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (online) return null

  const label =
    productCount != null && productCount > 0
      ? `Sem internet — ${productCount} produtos neste PC`
      : 'Sem internet — catálogo local vazio (conecte uma vez)'

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 inline-flex max-w-[min(100vw-2rem,22rem)] items-center gap-2 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-red-900/30 ring-1 ring-red-700/40"
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-300 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-200" />
      </span>
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{label}</span>
    </div>
  )
}
