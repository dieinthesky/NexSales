'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BarcodeCameraScannerProps {
  open: boolean
  onClose: () => void
  onDetect: (code: string) => void
}

function supportsBarcodeDetector(): boolean {
  return typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function'
}

export function BarcodeCameraScanner({
  open,
  onClose,
  onDetect,
}: BarcodeCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastCodeRef = useRef('')
  const lastAtRef = useRef(0)
  const onDetectRef = useRef(onDetect)
  onDetectRef.current = onDetect
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setReady(false)
  }, [])

  useEffect(() => {
    if (!open) {
      stop()
      setError(null)
      return
    }

    let cancelled = false

    async function start() {
      if (!supportsBarcodeDetector()) {
        setError('Câmera com leitura automática não disponível neste navegador. Use Chrome no Android ou digite o código.')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Câmera não disponível neste dispositivo.')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setReady(true)
        setError(null)

        const detector = new window.BarcodeDetector!({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        })

        const tick = async () => {
          if (cancelled || !videoRef.current) return
          try {
            if (videoRef.current.readyState >= 2) {
              const codes = await detector.detect(videoRef.current)
              const value = codes[0]?.rawValue?.trim()
              const now = Date.now()
              if (
                value &&
                (value !== lastCodeRef.current || now - lastAtRef.current > 2500)
              ) {
                lastCodeRef.current = value
                lastAtRef.current = now
                onDetectRef.current(value)
              }
            }
          } catch {
            // frame miss — keep looping
          }
          rafRef.current = requestAnimationFrame(() => {
            void tick()
          })
        }
        rafRef.current = requestAnimationFrame(() => {
          void tick()
        })
      } catch {
        setError('Não foi possível abrir a câmera. Permita o acesso ou digite o código.')
      }
    }

    void start()
    return () => {
      cancelled = true
      stop()
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
          onClick={onClose}
          aria-label="Fechar câmera"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="relative mx-4 flex-1 overflow-hidden rounded-2xl bg-slate-900">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-36 w-[85%] max-w-sm rounded-xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
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
        <p className="px-4 py-3 text-center text-xs text-white/60">
          Ao ler, o código preenche sozinho. Você pode fechar e digitar se preferir.
        </p>
      )}

      <div className="px-4 pb-6 pt-2">
        <Button type="button" className="w-full" variant="secondary" onClick={onClose}>
          Digitar código
        </Button>
      </div>
    </div>
  )
}

export function canUseBarcodeCamera(): boolean {
  return supportsBarcodeDetector()
}
