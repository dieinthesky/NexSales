import { MonitorDown } from 'lucide-react'
import { requireAuth } from '@/lib/auth/roles'
import { DownloadApp, DownloadInfo } from './download-app'

export default async function BaixarAppPage() {
  await requireAuth()

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <MonitorDown className="h-5 w-5 text-primary" />
          Baixar o aplicativo
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Versão para Windows, instalável no computador do caixa. Funciona como
          um programa fixo e continua operando mesmo se a internet cair.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800/60 dark:to-slate-800/40 p-6 shadow-sm">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-primary">
            Aplicativo Desktop
          </span>
          <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            CaixaDoBairro para Windows
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Mesmo sistema do site, numa janela própria. Login e dados são os
            mesmos — o que você vende aqui aparece em todo lugar.
          </span>
        </div>

        <div className="mt-5">
          <DownloadApp />
        </div>
      </div>

      <DownloadInfo />

      <p className="text-xs text-slate-400 dark:text-slate-500">
        O dono pode acompanhar as vendas pelo celular ou pelo site — o download
        aqui é só para instalar o ponto de venda no computador.
      </p>
    </div>
  )
}
