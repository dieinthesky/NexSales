import 'server-only'
import { isElectron } from '@/lib/db/client'
import type { CustomerBalance, Customer, DebtPayment, Sale } from '@/types/database'
import {
  applyStoreFilter,
  assertStoreAccess,
  getAppDataContext,
  withAppDataOrSqlite,
} from '@/lib/supabase/app-data'

export interface PaymentReceiptData {
  payment: DebtPayment
  customer: Customer
  remainingDebt: number
}

export async function getCustomersWithDebt(): Promise<CustomerBalance[]> {
  return withAppDataOrSqlite(
    async () => {
      const ctx = await getAppDataContext()
      let query = ctx.client
        .from('customer_balances')
        .select('*')
        .gt('current_debt', 0)
        .order('current_debt', { ascending: false })
      query = applyStoreFilter(query, ctx)
      const { data, error } = await query
      if (error) throw error
      return data as CustomerBalance[]
    },
    async () => {
      const { getCustomersWithDebt: sqliteGet } = await import('@/lib/db/queries/customers')
      return sqliteGet()
    },
  )
}

export interface CustomerDetails {
  customer: Customer
  fiadoSales: (Sale & {
    sale_items: {
      quantity: number
      unit_price: number
      subtotal: number
      products: { name: string }
    }[]
  })[]
  debtPayments: DebtPayment[]
  totalFiado: number
  totalPaid: number
  currentDebt: number
}

export async function getCustomerDetails(id: string): Promise<CustomerDetails | null> {
  try {
    const ctx = await getAppDataContext()

    const [customerRes, salesRes, paymentsRes, balanceRes] = await Promise.all([
      ctx.client.from('customers').select('*').eq('id', id).maybeSingle(),
      ctx.client
        .from('sales')
        .select('*, sale_items(quantity, unit_price, subtotal, products(name))')
        .eq('customer_id', id)
        .eq('payment_method', 'fiado')
        .order('created_at', { ascending: false }),
      ctx.client
        .from('debt_payments')
        .select('*')
        .eq('customer_id', id)
        .order('created_at', { ascending: false }),
      ctx.client
        .from('customer_balances')
        .select('total_fiado, total_paid, current_debt')
        .eq('id', id)
        .maybeSingle(),
    ])

    if (customerRes.error || !customerRes.data) {
      if (isElectron()) {
        const { getCustomerDetails: sqliteGet } = await import('@/lib/db/queries/customers')
        return sqliteGet(id)
      }
      return null
    }

    const customer = customerRes.data as Customer
    if (!assertStoreAccess(ctx, customer.store_id)) return null

    const fiadoSales = (salesRes.data ?? []) as CustomerDetails['fiadoSales']
    const debtPayments = (paymentsRes.data ?? []) as DebtPayment[]

    const totalFiado =
      balanceRes.data?.total_fiado ??
      fiadoSales.reduce((sum, s) => sum + s.total_amount, 0)
    const totalPaid =
      balanceRes.data?.total_paid ?? debtPayments.reduce((sum, p) => sum + p.amount, 0)
    const currentDebt = balanceRes.data?.current_debt ?? totalFiado - totalPaid

    return {
      customer,
      fiadoSales,
      debtPayments,
      totalFiado,
      totalPaid,
      currentDebt,
    }
  } catch {
    if (isElectron()) {
      const { getCustomerDetails: sqliteGet } = await import('@/lib/db/queries/customers')
      return sqliteGet(id)
    }
    return null
  }
}

export async function getPaymentReceipt(
  customerId: string,
  paymentId: string,
): Promise<PaymentReceiptData | null> {
  try {
    const ctx = await getAppDataContext()

    const [paymentRes, customerRes, balanceRes] = await Promise.all([
      ctx.client
        .from('debt_payments')
        .select('*')
        .eq('id', paymentId)
        .eq('customer_id', customerId)
        .maybeSingle(),
      ctx.client.from('customers').select('*').eq('id', customerId).maybeSingle(),
      ctx.client
        .from('customer_balances')
        .select('current_debt')
        .eq('id', customerId)
        .maybeSingle(),
    ])

    if (paymentRes.data && customerRes.data) {
      const customer = customerRes.data as Customer
      if (!assertStoreAccess(ctx, customer.store_id)) return null
      return {
        payment: paymentRes.data as DebtPayment,
        customer,
        remainingDebt: balanceRes.data?.current_debt ?? 0,
      }
    }
  } catch {
    // fall through
  }

  if (isElectron()) {
    const { getPaymentReceipt: sqliteGet } = await import('@/lib/db/queries/customers')
    return sqliteGet(customerId, paymentId)
  }

  return null
}
