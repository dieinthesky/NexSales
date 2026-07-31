'use client'

import { useEffect, useState } from 'react'
import { Download, MonitorDown, Check, ShieldAlert, WifiOff } from 'lucide-react'

const DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL ||
  '#'

export function DownloadApp() {
  const [inDesktopApp, setInDesktopApp] = useState(false)

  useEffect(() => {
    setInDesktopApp(/electron/i.test(navigator.userAgent))
  }, [])

  if (inDesktopApp) {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-400">
        <Check className="h-4 w-4" />
        Você já está usando o aplicativo desktop.
      </div>
    )
  }

  return (
    <a
      href={DOWNLOAD_URL}
      rel="noopener"
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-primary/10 hover:bg-primary/90 active:bg-primary/80 transition-colors"
    >
      <Download className="h-4.5 w-4.5" />
      Baixar para Windows
    </a>
  )
}

export function DownloadInfo() {
  const steps = [
    {
      icon: MonitorDown,
      title: 'Instale no computador do caixa',
      body: 'Abra o arquivo baixado e siga o instalador. Cria um atalho na área de trabalho.',
    },
    {
      icon: ShieldAlert,
      title: 'Aviso do Windows (normal)',
      body: 'O instalador não é assinado. Se aparecer o SmartScreen, clique em "Mais informações" → "Executar assim mesmo".',
    },
    {
      icon: WifiOff,
      title: 'Funciona sem internet',
      body: 'Após o primeiro acesso online (para logar), o app continua vendendo se a conexão cair — as vendas sincronizam ao reconectar.',
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {steps.map((s) => (
        <div
          key={s.title}
          className="rounded-xl border border-slate-200 dark:border-white/8 bg-white dark:bg-slate-800/60 p-4"
        >
          <s.icon className="h-5 w-5 text-primary" />
          <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{s.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{s.body}</p>
        </div>
      ))}
    </div>
  )
}
