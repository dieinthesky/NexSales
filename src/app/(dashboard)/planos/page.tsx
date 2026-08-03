import { requireAuth } from '@/lib/auth/roles'
import { loadStoreSubscription } from '@/lib/store-subscription'
import { SubscriptionStatusView } from './subscription-status-view'
import { MasterPlansMarketing } from './master-plans-marketing'

export const metadata = {
  title: 'Minha assinatura',
}

export default async function PlanosPage() {
  const user = await requireAuth()

  if (user.role === 'master') {
    return (
      <div className="space-y-10">
        <MasterPlansMarketing />
        {user.storeId ? (
          <div className="border-t border-slate-200 pt-8 dark:border-white/10">
            <p className="mb-4 text-sm font-medium text-slate-500">
              Sua loja (se a conta Master estiver vinculada a uma loja)
            </p>
            <SubscriptionStatusView
              storeName={user.storeName || 'Loja'}
              view={(await loadStoreSubscription(user.storeId)).view}
              isMaster
            />
          </div>
        ) : null}
      </div>
    )
  }

  if (!user.storeId) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Minha assinatura
        </h1>
        <p className="text-sm text-slate-500">
          Conta sem loja vinculada. Peça ao suporte para associar sua conta a um mercadinho.
        </p>
      </div>
    )
  }

  const { view } = await loadStoreSubscription(user.storeId)
  return (
    <SubscriptionStatusView
      storeName={user.storeName || 'Sua loja'}
      view={view}
      isMaster={false}
    />
  )
}
