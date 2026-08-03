import { requireAdmin } from '@/lib/auth/roles'
import { loadStorePixForCurrentUser } from './actions'
import { PixSettingsForm } from './pix-settings-form'

export const metadata = {
  title: 'PIX da loja',
}

export default async function PixConfigPage() {
  await requireAdmin()
  const data = await loadStorePixForCurrentUser()

  if (!data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          PIX da loja
        </h1>
        <p className="text-sm text-slate-500">
          Sua conta precisa estar ligada a uma loja para cadastrar o PIX.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          PIX da loja
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Cadastre a chave da sua loja. No caixa, na hora de receber, o QR e o código para copiar
          usam esses dados (forma de pagamento PIX).
        </p>
      </div>
      <PixSettingsForm initial={data.form} storeName={data.storeName} />
    </div>
  )
}
