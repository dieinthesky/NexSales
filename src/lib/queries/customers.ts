import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { isElectron } from '@/lib/db/client'
import type { CustomerBalance, Customer, DebtPayment, Sale } from '@/types/database'

export interface PaymentReceiptData {
  payment: DebtPayment
  customer: Customer
  remainingDebt: number
}

export async function getCustomersWithDebt(): Promise<CustomerBalance[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('customer_balances')
      .select('*')
      .gt('current_debt', 0)
      .order('current_debt', { ascending: false })
    if (error) throw error
    return data as CustomerBalance[]
  } catch {
    if (isElectron()) {
      const { getCustomersWithDebt: sqliteGet } = await import('@/lib/db/queries/customers')
      return sqliteGet()
    }
    throw new Error('Supabase unreachable')
  }
}

export interface CustomerDetails {
  customer: Customer
  fiadoSales: (Sale & { sale_items: { quantity: number; unit_price: number; subtotal: number; products: { name: string } }[] })[]
  debtPayments: DebtPayment[]
  totalFiado: number
  totalPaid: number
  currentDebt: number
}

export async function getCustomerDetails(id: string): Promise<CustomerDetails | null> {
  try {
    const supabase = await createClient()

    const [customerRes, salesRes, paymentsRes, balanceRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase
        .from('sales')
        .select('*, sale_items(quantity, unit_price, subtotal, products(name))')
        .eq('customer_id', id)
        .eq('payment_method', 'fiado')
        .order('created_at', { ascending: false }),
      supabase
        .from('debt_payments')
        .select('*')
        .eq('customer_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('customer_balances')
        .select('total_fiado, total_paid, current_debt')
        .eq('id', id)
        .single(),
    ])

    if (customerRes.error || !customerRes.data) {
      if (isElectron()) {
        const { getCustomerDetails: sqliteGet } = await import('@/lib/db/queries/customers')
        return sqliteGet(id)
      }
      return null
    }

    const fiadoSales = (salesRes.data ?? []) as CustomerDetails['fiadoSales']
    const debtPayments = (paymentsRes.data ?? []) as DebtPayment[]

    const totalFiado = balanceRes.data?.total_fiado ?? fiadoSales.reduce((sum, s) => sum + s.total_amount, 0)
    const totalPaid = balanceRes.data?.total_paid ?? debtPayments.reduce((sum, p) => sum + p.amount, 0)
    const currentDebt = balanceRes.data?.current_debt ?? (totalFiado - totalPaid)

    return {
      customer: customerRes.data as Customer,
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
    const supabase = await createClient()

    const [paymentRes, customerRes, balanceRes] = await Promise.all([
      supabase.from('debt_payments').select('*').eq('id', paymentId).eq('customer_id', customerId).single(),
      supabase.from('customers').select('*').eq('id', customerId).single(),
      supabase.from('customer_balances').select('current_debt').eq('id', customerId).single(),
    ])

    if (!paymentRes.error && paymentRes.data && !customerRes.error && customerRes.data) {
      return {
        payment: paymentRes.data as DebtPayment,
        customer: customerRes.data as Customer,
        remainingDebt: balanceRes.data?.current_debt ?? 0,
      }
    }
  } catch {
    // fall through to SQLite
  }

  if (isElectron()) {
    const { getPaymentReceipt: sqliteGet } = await import('@/lib/db/queries/customers')
    return sqliteGet(customerId, paymentId)
  }

  return null
}
