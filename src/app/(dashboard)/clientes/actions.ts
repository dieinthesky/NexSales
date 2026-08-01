'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Customer, CustomerBalance } from '@/types/database'

export interface SearchCustomersResult {
  customers?: CustomerBalance[]
  error?: string
}

export async function searchCustomers(query: string): Promise<SearchCustomersResult> {
  if (!query.trim()) return { customers: [] }

  const supabase = await createClient()
  const q = query.trim()

  // Detect phone search (digits, spaces, dashes, parens) and strip formatting
  // to avoid PostgREST parsing issues with parentheses in ilike filter strings.
  const isPhone = /^[\d\s\-()+]+$/.test(q)
  const base = supabase.from('customer_balances').select('*').order('full_name').limit(20)
  const { data, error } = isPhone
    ? await base.ilike('phone', `%${q.replace(/\D/g, '')}%`)
    : await base.ilike('full_name', `%${q}%`)

  if (error) return { error: error.message }
  return { customers: data as CustomerBalance[] }
}

export interface CreateCustomerInput {
  fullName: string
  phone: string
}

export interface CreateCustomerResult {
  customer?: Customer
  error?: string
}

export async function createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
  const supabase = await createClient()
  const { data: storeId, error: storeError } = await supabase.rpc('user_store_id')
  if (storeError || !storeId) {
    return { error: 'Sua conta não está vinculada a uma loja.' }
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      store_id: storeId as string,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/clientes')
  return { customer: data as Customer }
}

export interface RecordDebtPaymentInput {
  customerId: string
  amount: number
  notes?: string
}

export interface RecordDebtPaymentResult {
  success: boolean
  paymentId?: string
  error?: string
}

export async function recordDebtPayment(
  input: RecordDebtPaymentInput
): Promise<RecordDebtPaymentResult> {
  const supabase = await createClient()

  const { data: paymentId, error } = await supabase.rpc('record_debt_payment', {
    p_customer_id: input.customerId,
    p_amount: input.amount,
    p_notes: input.notes?.trim() || null,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/clientes')
  revalidatePath(`/clientes/${input.customerId}`)
  return { success: true, paymentId: paymentId as string }
}
