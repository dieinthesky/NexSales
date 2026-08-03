'use client'

import { Wifi, WifiOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { LocalCatalogStatus } from '@/lib/offline/catalog-status'

interface CatalogGateProps {
  status: LocalCatalogStatus | null
  pulling: boolean
  onPull: () => void
  children: React.ReactNode
}

/**
 * Não deixa o caixa operar sem produtos no cache local.
 * Offline + vazio = peça net. Online + vazio = botão baixar.
 */
export function CatalogGate({ status, pulling, onPull, children }: CatalogGateProps) {
  if (!status) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-white text-slate-600">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        <p className="text-sm">Preparando o caixa…</p>
      </div>
    )
  }

  if (status.ready) {
    return <>{children}</>
  }

  // Cache vazio
  if (!status.online) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-white px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <WifiOff className="h-7 w-7" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-bold text-slate-900">
            Catálogo local vazio
          </h2>
          <p className="text-sm text-slate-600">
            Sem internet e sem produtos salvos neste computador. Conecte a rede
            uma vez, abra o CaixaDoBairro e aguarde o catálogo baixar. Depois o
            PDV funciona offline.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-white px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-sky-700">
        <Wifi className="h-7 w-7" />
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="text-lg font-bold text-slate-900">
          Baixe o catálogo para usar o caixa
        </h2>
        <p className="text-sm text-slate-600">
          Os produtos ainda não estão neste PC. Clique abaixo (com internet)
          para copiar o catálogo da loja. Isso é feito só uma vez — ou quando
          houver produtos novos.
        </p>
      </div>
      <Button
        type="button"
        disabled={pulling}
        onClick={onPull}
        className="min-w-[200px] bg-[#1e3a5f] hover:bg-[#234e7a]"
      >
        {pulling ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Baixando…
          </>
        ) : (
          'Baixar catálogo agora'
        )}
      </Button>
    </div>
  )
}
