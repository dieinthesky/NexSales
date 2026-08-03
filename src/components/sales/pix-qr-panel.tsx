'use client'

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { buildPixPayload, isPixConfigured } from '@/lib/utils/pix-brcode'
import { formatCurrency } from '@/lib/utils/format'

export type StorePixConfig = {
  key: string
  merchantName: string
  merchantCity?: string
}

interface PixQrPanelProps {
  config: StorePixConfig | null
  /** Valor do PIX (R$). Pode ser 0 até o valor ser definido. */
  amount: number
  configureHref?: string
}

export function PixQrPanel({
  config,
  amount,
  configureHref = '/configuracoes/pix',
}: PixQrPanelProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const payload = useMemo(() => {
    if (!config || !isPixConfigured(config.key)) return null
    return buildPixPayload({
      key: config.key,
      merchantName: config.merchantName || 'CAIXA DO BAIRRO',
      merchantCity: config.merchantCity || 'SAO PAULO',
      amount: amount > 0 ? amount : undefined,
      txid: `CDB${Date.now().toString(36).toUpperCase().slice(-12)}`,
    })
  }, [config, amount])

  useEffect(() => {
    let cancelled = false
    if (!payload) {
      setDataUrl(null)
      return
    }
    void QRCode.toDataURL(payload, {
      margin: 1,
      width: 220,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then((url) => {
      if (!cancelled) setDataUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [payload])

  async function copyPix() {
    if (!payload) return
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      toast.success('Código PIX copiado')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  if (!config || !isPixConfigured(config.key)) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-center">
        <QrCode className="mx-auto h-6 w-6 text-slate-400" />
        <p className="mt-2 text-xs font-medium text-slate-700">Ainda sem chave PIX</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          O dono da loja cadastra em{' '}
          <a href={configureHref} className="font-semibold text-[#234e7a] underline">
            PIX da loja
          </a>{' '}
          no menu — leva menos de um minuto.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-800">
        PIX · QR Code
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
        {amount > 0 ? formatCurrency(amount) : 'Valor no app do banco'}
      </p>
      <div className="mt-2 flex flex-col items-center gap-2">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt="QR Code PIX"
            className="h-[180px] w-[180px] rounded-lg border border-slate-100 bg-white"
          />
        ) : (
          <div className="flex h-[180px] w-[180px] items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-400">
            Gerando QR...
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full text-xs"
          onClick={() => void copyPix()}
          disabled={!payload}
        >
          {copied ? (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copia e cola
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
