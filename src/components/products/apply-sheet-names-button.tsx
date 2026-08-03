'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { applyProductNameCorrectionsFromSheet } from '@/app/(dashboard)/produtos/actions'

const SESSION_KEY = 'cdb-sheet-names-applied-v1'

/**
 * Aplica a planilha produtos_corrigidos (JSON embutido) na loja atual.
 * Ao montar a página Produtos, tenta uma vez por sessão do navegador.
 */
export function ApplySheetNamesButton({ auto = true }: { auto?: boolean }) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const started = useRef(false)

  async function run(fromAuto: boolean) {
    if (running) return
    if (fromAuto && typeof window !== 'undefined') {
      try {
        if (sessionStorage.getItem(SESSION_KEY) === '1') return
      } catch {
        // ignore
      }
    }

    setRunning(true)
    try {
      const result = await applyProductNameCorrectionsFromSheet()
      if (result.message && result.updated === 0 && result.matched === 0) {
        if (!fromAuto) toast.error(result.message)
      } else if (result.updated > 0) {
        toast.success(
          `${result.updated} nomes da planilha aplicados` +
            (result.samples[0]
              ? ` · ex.: ${result.samples[0].oldName} → ${result.samples[0].newName}`
              : ''),
        )
        router.refresh()
      } else if (!fromAuto) {
        toast.message(result.message ?? 'Nada a alterar')
      }

      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(SESSION_KEY, '1')
        } catch {
          // ignore
        }
      }
    } catch {
      if (!fromAuto) toast.error('Falha ao aplicar a planilha de nomes.')
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    if (!auto || started.current) return
    started.current = true
    void run(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto])

  return (
    <Button
      type="button"
      variant="outline"
      disabled={running}
      onClick={() => void run(false)}
      className="border-slate-200 dark:border-white/10 dark:text-slate-200"
      title="Aplica os nomes da planilha produtos_corrigidos nesta loja"
    >
      {running ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="mr-1.5 h-4 w-4" />
      )}
      {running ? 'Aplicando planilha…' : 'Aplicar planilha de nomes'}
    </Button>
  )
}
