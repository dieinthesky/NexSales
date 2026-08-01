import { Store } from 'lucide-react'
import { requireMaster } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ProvisionStoreForm } from './provision-store-form'
import { ResetStoreButton } from './reset-store-button'

export const metadata = { title: 'Lojas' }

export default async function LojasPage() {
  await requireMaster()
  const supabase = await createClient()

  const { data: stores } = await supabase
    .from('stores')
    .select('id, name, slug, is_template, created_at')
    .order('created_at', { ascending: false })

  const rows = stores ?? []

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Store className="h-6 w-6 text-slate-700 dark:text-slate-200" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Lojas
          </h1>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Conta Master: provisione lojas novas (dono + catálogo modelo) e zere vendas/fiado sem apagar produtos.
        </p>
      </div>

      <ProvisionStoreForm />

      <Card className="overflow-hidden border-slate-200/80 dark:border-white/8">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-slate-400">
                  Nenhuma loja ainda.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-slate-500">{s.slug}</TableCell>
                  <TableCell>
                    {s.is_template ? (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-700">
                        Catálogo modelo
                      </span>
                    ) : (
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                        Cliente
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.is_template ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <ResetStoreButton storeId={s.id} storeName={s.name} />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
