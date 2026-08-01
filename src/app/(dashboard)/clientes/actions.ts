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

export async function updateCustomer(input: {
  customerId: string
  fullName: string
  phone?: string
  notes?: string
}): Promise<{ success?: boolean; error?: string }> {
  const name = input.fullName.trim()
  if (!name) return { error: 'Nome é obrigatório.' }

  const { isAdmin } = await import('@/lib/auth/roles')
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem editar clientes.' }
  }

  const {
    canAccessStoreRow,
    getAdminDataClient,
    resolveAdminContext,
  } = await import('@/lib/supabase/admin-data')

  const { role, storeId } = await resolveAdminContext()
  const supabase = await getAdminDataClient()
  const { data: existing } = await supabase
    .from('customers')
    .select('id, store_id')
    .eq('id', input.customerId)
    .maybeSingle()

  if (!existing) return { error: 'Cliente não encontrado.' }
  if (!canAccessStoreRow(role, storeId, existing.store_id)) {
    return { error: 'Sem permissão para editar este cliente.' }
  }

  const { error } = await supabase
    .from('customers')
    .update({
      full_name: name,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .eq('id', input.customerId)

  if (error) return { error: error.message }

  revalidatePath('/clientes')
  revalidatePath(`/clientes/${input.customerId}`)
  return { success: true }
}

export async function deleteCustomer(
  customerId: string,
): Promise<{ success?: boolean; error?: string }> {
  const { isAdmin } = await import('@/lib/auth/roles')
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem excluir clientes.' }
  }

  const {
    canAccessStoreRow,
    getAdminDataClient,
    resolveAdminContext,
  } = await import('@/lib/supabase/admin-data')

  const { role, storeId } = await resolveAdminContext()
  const supabase = await getAdminDataClient()
  const { data: existing } = await supabase
    .from('customers')
    .select('id, store_id')
    .eq('id', customerId)
    .maybeSingle()

  if (!existing) return { error: 'Cliente não encontrado.' }
  if (!canAccessStoreRow(role, storeId, existing.store_id)) {
    return { error: 'Sem permissão para excluir este cliente.' }
  }

  const { data: balance } = await supabase
    .from('customer_balances')
    .select('current_debt')
    .eq('id', customerId)
    .maybeSingle()

  if ((balance?.current_debt ?? 0) > 0) {
    return { error: 'Cliente ainda tem débito em aberto. Quite o fiado antes de excluir.' }
  }

  const { count: salesCount } = await supabase
    .from('sales')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', customerId)

  if ((salesCount ?? 0) > 0) {
    return {
      error: 'Cliente tem vendas no histórico e não pode ser excluído.',
    }
  }

  const { count: paymentsCount } = await supabase
    .from('debt_payments')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', customerId)

  if ((paymentsCount ?? 0) > 0) {
    return {
      error: 'Cliente tem pagamentos registrados e não pode ser excluído.',
    }
  }

  const { error } = await supabase.from('customers').delete().eq('id', customerId)
  if (error) return { error: error.message }

  revalidatePath('/clientes')
  return { success: true }
}
