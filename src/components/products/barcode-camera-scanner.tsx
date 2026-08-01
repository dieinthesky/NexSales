'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BarcodeCameraScannerProps {
  open: boolean
  onClose: () => void
  onDetect: (code: string) => void
}

/** Safari iOS / Chrome / etc. — precisa de HTTPS + getUserMedia. */
function canUseCamera(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  )
}

async function preferContinuousFocus(root: HTMLElement) {
  try {
    const video = root.querySelector('video')
    const stream = video?.srcObject
    if (!(stream instanceof MediaStream)) return
    const track = stream.getVideoTracks()[0]
    if (!track) return
    const caps = track.getCapabilities?.() as MediaTrackCapabilities & {
      focusMode?: string[]
    }
    if (caps?.focusMode?.includes('continuous')) {
      await track.applyConstraints({
        // Safari/Chrome: melhora leitura de EAN em produtos próximos
        advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
      })
    }
  } catch {
    // aparelho sem suporte — segue sem foco contínuo
  }
}

export function BarcodeCameraScanner({
  open,
  onClose,
  onDetect,
}: BarcodeCameraScannerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<{
    stop: () => Promise<void>
    clear: () => void
  } | null>(null)
  const lastCodeRef = useRef('')
  const lastAtRef = useRef(0)
  const onDetectRef = useRef(onDetect)
  onDetectRef.current = onDetect
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [hint, setHint] = useState('Aproxime o código e espere o bip…')

  const stop = useCallback(async () => {
    const scanner = scannerRef.current
    scannerRef.current = null
    if (!scanner) {
      setReady(false)
      return
    }
    try {
      await scanner.stop()
    } catch {
      // already stopped
    }
    try {
      scanner.clear()
    } catch {
      // ignore
    }
    setReady(false)
  }, [])

  useEffect(() => {
    if (!open) {
      void stop()
      setError(null)
      setHint('Aproxime o código e espere o bip…')
      return
    }

    let cancelled = false

    async function start() {
      if (!canUseCamera()) {
        setError('Câmera não disponível. Use HTTPS e permita o acesso, ou digite o código.')
        return
      }
      if (!hostRef.current) return

      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')

        hostRef.current.innerHTML = ''
        const readerId = 'visita-barcode-reader'
        const mount = document.createElement('div')
        mount.id = readerId
        mount.className = 'h-full w-full'
        hostRef.current.appendChild(mount)

        const scanner = new Html5Qrcode(readerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          // Usa BarcodeDetector nativo quando existir (Chrome); no Safari cai no ZXing.
          useBarCodeDetectorIfSupported: true,
          verbose: false,
        })
        scannerRef.current = scanner

        /**
         * Sem `qrbox`: o decoder lê o frame inteiro.
         * O retângulo verde é só guia visual — códigos de barras 1D falham muito
         * quando a lib corta só o miolo da tela.
         */
        await scanner.start(
          {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          {
            fps: 20,
            disableFlip: false,
            aspectRatio: 1.777,
            videoConstraints: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          (decoded) => {
            const value = decoded?.trim()
            if (!value) return
            const now = Date.now()
            if (value === lastCodeRef.current && now - lastAtRef.current < 1800) return
            lastCodeRef.current = value
            lastAtRef.current = now
            setHint(`Lido: ${value}`)
            try {
              navigator.vibrate?.(40)
            } catch {
              // ignore
            }
            onDetectRef.current(value)
          },
          () => {
            // frame sem código
          },
        )

        if (cancelled) {
          await stop()
          return
        }

        if (hostRef.current) {
          await preferContinuousFocus(hostRef.current)
        }

        setReady(true)
        setError(null)
        setHint('Encaixe o código na faixa — a leitura usa a tela toda')
      } catch (err) {
        const message = err instanceof Error ? err.message : ''
        if (/NotAllowedError|Permission|denied/i.test(message)) {
          setError('Permissão da câmera negada. No iPhone: Ajustes → Safari → Câmera → Permitir, e tente de novo.')
        } else if (/NotFoundError|DevicesNotFound/i.test(message)) {
          setError('Nenhuma câmera encontrada neste aparelho.')
        } else {
          setError('Não foi possível abrir a câmera. Permita o acesso no Safari ou digite o código.')
        }
        setReady(false)
      }
    }

    void start()
    return () => {
      cancelled = true
      void stop()
    }
  }, [open, stop])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Camera className="h-4 w-4" />
          Aponte para o código de barras
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10"
          onClick={() => {
            void stop()
            onClose()
          }}
          aria-label="Fechar câmera"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="relative mx-4 flex-1 overflow-hidden rounded-2xl bg-slate-900">
        <div
          ref={hostRef}
          className="h-full w-full [&_img]:hidden [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
        />

        {/* Guia visual apenas — não limita a área de decode */}
        {ready && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-28 w-[90%] max-w-md rounded-xl border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]">
              <div className="absolute inset-x-6 top-1/2 h-px -translate-y-1/2 bg-emerald-300/70" />
            </div>
          </div>
        )}

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Abrindo câmera…
          </div>
        )}
      </div>

      {error ? (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl bg-amber-500/15 px-3 py-3 text-sm text-amber-100">
          <CameraOff className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : (
        <p className="px-4 py-3 text-center text-xs text-white/70">
          {hint}
          <br />
          Dica: aproxime ~15 cm, deixe o código reto e com boa luz.
        </p>
      )}

      <div className="px-4 pb-6 pt-2">
        <Button
          type="button"
          className="w-full"
          variant="secondary"
          onClick={() => {
            void stop()
            onClose()
          }}
        >
          Digitar código
        </Button>
      </div>
    </div>
  )
}

export function canUseBarcodeCamera(): boolean {
  return canUseCamera()
}
