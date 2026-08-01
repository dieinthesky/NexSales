import 'server-only'
import { getDb } from '../client'
import type { CustomerBalance, Customer, DebtPayment, Sale } from '@/types/database'
import type { PaymentReceiptData, CustomerDetails } from '@/lib/queries/customers'

interface RawBalanceRow {
  id: string
  full_name: string
  phone: string | null
  notes: string | null
  created_at: string
  updated_at: string
  total_fiado: number
  total_paid: number
  current_debt: number
  last_payment_at: string | null
  first_fiado_at: string | null
}

export function getCustomersWithDebt(): CustomerBalance[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT * FROM customer_balances
       WHERE current_debt > 0
       ORDER BY current_debt DESC`,
    )
    .all() as RawBalanceRow[]
  return rows as unknown as CustomerBalance[]
}

export function getCustomerDetails(id: string): CustomerDetails | null {
  const db = getDb()

  const customer = db
    .prepare(`SELECT * FROM customers WHERE id = ?`)
    .get(id) as Customer | undefined
  if (!customer) return null

  interface FiadoSaleRow {
    id: string
    total_amount: number
    payment_method: string
    notes: string | null
    seller_id: string
    store_id: string
    created_at: string
    client_uuid: string | null
    customer_id: string | null
    item_id: string | null
    quantity: number | null
    unit_price: number | null
    subtotal: number | null
    prod_name: string | null
  }

  const rawSales = db
    .prepare(
      `SELECT s.id, s.total_amount, s.payment_method, s.notes, s.seller_id, s.store_id, s.created_at,
              s.client_uuid, s.customer_id,
              si.id AS item_id, si.quantity, si.unit_price, si.subtotal,
              p.name AS prod_name
       FROM sales s
       LEFT JOIN sale_items si ON si.sale_id = s.id
       LEFT JOIN products p ON p.id = si.product_id
       WHERE s.customer_id = ? AND s.payment_method = 'fiado'
       ORDER BY s.created_at DESC`,
    )
    .all(id) as FiadoSaleRow[]

  // Group flat rows into nested sales
  const salesMap = new Map<string, CustomerDetails['fiadoSales'][0]>()
  for (const row of rawSales) {
    if (!salesMap.has(row.id)) {
      salesMap.set(row.id, {
        id: row.id,
        total_amount: row.total_amount,
        payment_method: row.payment_method as Sale['payment_method'],
        notes: row.notes,
        seller_id: row.seller_id,
        store_id: row.store_id,
        created_at: row.created_at,
        client_uuid: row.client_uuid,
        customer_id: row.customer_id,
        sale_items: [],
      })
    }
    if (row.item_id) {
      salesMap.get(row.id)!.sale_items.push({
        quantity: row.quantity!,
        unit_price: row.unit_price!,
        subtotal: row.subtotal!,
        products: { name: row.prod_name ?? '' },
      })
    }
  }
  const fiadoSales = Array.from(salesMap.values())

  const debtPayments = db
    .prepare(`SELECT * FROM debt_payments WHERE customer_id = ? ORDER BY created_at DESC`)
    .all(id) as DebtPayment[]

  const balanceRow = db
    .prepare(`SELECT total_fiado, total_paid, current_debt FROM customer_balances WHERE id = ?`)
    .get(id) as { total_fiado: number; total_paid: number; current_debt: number } | undefined

  const totalFiado = balanceRow?.total_fiado ?? fiadoSales.reduce((s, sale) => s + sale.total_amount, 0)
  const totalPaid = balanceRow?.total_paid ?? debtPayments.reduce((s, p) => s + p.amount, 0)
  const currentDebt = balanceRow?.current_debt ?? totalFiado - totalPaid

  return { customer, fiadoSales, debtPayments, totalFiado, totalPaid, currentDebt }
}

export function getPaymentReceipt(
  customerId: string,
  paymentId: string,
): PaymentReceiptData | null {
  const db = getDb()

  const payment = db
    .prepare(`SELECT * FROM debt_payments WHERE id = ? AND customer_id = ?`)
    .get(paymentId, customerId) as DebtPayment | undefined
  if (!payment) return null

  const customer = db
    .prepare(`SELECT * FROM customers WHERE id = ?`)
    .get(customerId) as Customer | undefined
  if (!customer) return null

  const balanceRow = db
    .prepare(`SELECT current_debt FROM customer_balances WHERE id = ?`)
    .get(customerId) as { current_debt: number } | undefined

  return {
    payment,
    customer,
    remainingDebt: balanceRow?.current_debt ?? 0,
  }
}
