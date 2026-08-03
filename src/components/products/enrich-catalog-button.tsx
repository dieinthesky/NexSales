'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { enrichProductsByBarcodeBatch } from '@/app/(dashboard)/produtos/actions'

/**
 * Roda a mega-pesquisa em lotes (5 produtos/request) até acabar.
 * Atualiza nome e categoria a partir do código de barras.
 */
export function EnrichCatalogButton() {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  async function handleRun() {
    if (running) return
    const ok = window.confirm(
      'Isso vai pesquisar cada código de barras online e trocar nomes/categorias ' +
        'pelo que achar nas bases (Cosmos, Open Food Facts…).\n\n' +
        'Preço de venda, custo e estoque NÃO mudam.\n\n' +
        'Pode levar alguns minutos nos ~300 produtos. Continuar?',
    )
    if (!ok) return

    setRunning(true)
    let offset = 0
    let totalUpdated = 0
    let totalNotFound = 0
    let totalSkipped = 0
    let totalErrors = 0
    let totalEligible = 0

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await enrichProductsByBarcodeBatch(offset)
        if (batch.message && batch.totalEligible === 0 && batch.done) {
          toast.error(batch.message)
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
          `${pct}% · ${offset}/${totalEligible} códigos · ${totalUpdated} atualizados`,
        )

        if (batch.samples[0]) {
          const s = batch.samples[0]
          toast.message(`${s.oldName} → ${s.newName}`, {
            description: s.category ? `Categoria: ${s.category}` : undefined,
            duration: 2500,
          })
        }

        if (batch.done) break
        // Respiro entre lotes (rate limit das APIs)
        await new Promise((r) => setTimeout(r, 400))
      }

      toast.success(
        `Pronto: ${totalUpdated} nomes atualizados` +
          (totalNotFound ? ` · ${totalNotFound} sem resultado na base` : '') +
          (totalSkipped ? ` · ${totalSkipped} já ok` : '') +
          (totalErrors ? ` · ${totalErrors} erros` : ''),
      )
      router.refresh()
    } catch {
      toast.error('Falha no meio da pesquisa. Tente de novo — retoma do ponto atual não, refaz do início.')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col items-stretch sm:items-end gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={running}
        onClick={() => void handleRun()}
        className="border-slate-200 dark:border-white/10 dark:text-slate-200"
      >
        {running ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-1.5 h-4 w-4" />
        )}
        {running ? 'Pesquisando…' : 'Corrigir nomes pelo código'}
      </Button>
      {progress && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
          {progress}
        </p>
      )}
    </div>
  )
}
