import { formatCurrency, formatDate, PAYMENT_LABELS } from './format'
import type { SaleWithItems } from '@/types/database'

/**
 * Plain-text version of the receipt, suitable for WhatsApp / Clipboard.
 * The HTML version is rendered separately by the printable receipt page.
 */
export function buildReceiptText(
  sale: SaleWithItems,
  storeName = 'VendasApp',
): string {
  const lines: string[] = []
  const sep = '------------------------------'

  lines.push(storeName.toUpperCase())
  lines.push(sep)
  lines.push(`Venda: ${shortSaleId(sale.id)}`)
  lines.push(`Data:  ${formatDate(sale.created_at)}`)
  lines.push(sep)
  lines.push('ITEM            QTD   UNIT.   TOTAL')

  for (const item of sale.sale_items) {
    const name = truncate(item.products?.name ?? 'Produto removido', 18)
    const qty = String(item.quantity).padStart(3, ' ')
    const unit = formatCurrency(item.unit_price).padStart(8, ' ')
    const sub = formatCurrency(item.subtotal).padStart(9, ' ')
    lines.push(`${name.padEnd(18, ' ')} ${qty} ${unit}${sub}`)
    lines.push(`  Cód: ${item.products?.code ?? '—'}`)
  }

  lines.push(sep)
  lines.push(`TOTAL: ${formatCurrency(sale.total_amount)}`)
  lines.push(`Pagamento: ${PAYMENT_LABELS[sale.payment_method]}`)

  if (sale.notes) {
    lines.push(sep)
    lines.push(`Obs: ${sale.notes}`)
  }

  lines.push(sep)
  lines.push('Obrigado pela preferência!')

  return lines.join('\n')
}

/** Last 8 chars of the UUID, uppercased — good enough as a human reference. */
export function shortSaleId(id: string): string {
  return id.replace(/-/g, '').slice(-8).toUpperCase()
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, max - 1) + '…'
}
