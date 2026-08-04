'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileSpreadsheet, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  applyProductNameCorrectionsFromSheet,
  enrichProductsByBarcodeBatch,
} from '@/app/(dashboard)/produtos/actions'

/**
 * 1) Aplica a planilha de nomes (embutida)
 * 2) Opcional: pesquisa online o que sobrar
 */
export function EnrichCatalogButton() {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  async function applySheetOnly() {
    if (running) return
    setRunning(true)
    setProgress('Aplicando planilha de nomes…')
    try {
      const sheet = await applyProductNameCorrectionsFromSheet()
      if (sheet.updated > 0) {
        toast.success(
          `${sheet.updated} nomes da planilha aplicados` +
            (sheet.samples[0]
              ? ` · ex.: ${sheet.samples[0].oldName} → ${sheet.samples[0].newName}`
              : ''),
        )
      } else {
        toast.message(sheet.message ?? 'Nada a alterar na planilha')
      }
      router.refresh()
    } catch {
      toast.error('Falha ao aplicar a planilha.')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  async function handleOnlineEnrich() {
    if (running) return
    const ok = window.confirm(
      '1) Aplica primeiro a planilha de nomes.\n' +
        '2) Depois pesquisa online o que sobrar (Cosmos / bases abertas).\n\n' +
        'Preço, custo e estoque NÃO mudam. Continuar?',
    )
    if (!ok) return

    setRunning(true)
    try {
      setProgress('1/2 Planilha…')
      const sheet = await applyProductNameCorrectionsFromSheet()
      if (sheet.updated > 0) {
        toast.success(`${sheet.updated} da planilha aplicados`)
      }

      let offset = 0
      let totalUpdated = 0
      let totalNotFound = 0
      let totalSkipped = 0
      let totalErrors = 0
      let totalEligible = 0

      while (true) {
        const batch = await enrichProductsByBarcodeBatch(offset)
        if (batch.message && batch.totalEligible === 0 && batch.done) {
          if (sheet.updated === 0) toast.error(batch.message)
          break
        }

        totalEligible = batch.totalEligible
        totalUpdated += batch.updated
        totalNotFound += batch.notFound
        totalSkipped += batch.skipped
        totalErrors += batch.errors
        offset = batch.nextOffset

        const pct =
          totalEligible > 0
            ? Math.min(100, Math.round((offset / totalEligible) * 100))
            : 100
        setProgress(
          `2/2 Online ${pct}% · ${offset}/${totalEligible} · ${totalUpdated} atualizados`,
        )

        if (batch.done) break
        await new Promise((r) => setTimeout(r, 400))
      }

      toast.success(
        `Online: ${totalUpdated} nomes` +
          (totalNotFound ? ` · ${totalNotFound} sem base` : '') +
          (totalSkipped ? ` · ${totalSkipped} ok` : '') +
          (totalErrors ? ` · ${totalErrors} erros` : '') +
          (sheet.updated ? ` · planilha: ${sheet.updated}` : ''),
      )
      router.refresh()
    } catch {
      toast.error('Falha no meio da correção. Tente de novo.')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button
          type="button"
          disabled={running}
          onClick={() => void applySheetOnly()}
          className="bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm"
        >
          {running && progress?.startsWith('Aplicando') ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="mr-1.5 h-4 w-4" />
          )}
          Aplicar planilha de nomes
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={running}
          onClick={() => void handleOnlineEnrich()}
          className="border-slate-200 dark:border-white/10 dark:text-slate-200"
        >
          {running && progress?.startsWith('2/') ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          Planilha + pesquisa online
        </Button>
      </div>
      {progress && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
          {progress}
        </p>
      )}
    </div>
  )
}
