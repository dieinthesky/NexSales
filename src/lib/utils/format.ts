import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatBRDateTime } from '@/lib/utils/datetime'

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

// Always in BRT — same reasoning as the dashboard/cash-close helpers.
export function formatDate(date: string | Date): string {
  return formatBRDateTime(date)
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR })
}

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  credit: 'Cartão de Crédito',
  debit: 'Cartão de Débito',
  pix: 'PIX',
  fiado: 'Fiado',
  mixed: 'Misto',
}
