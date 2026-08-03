import { formatCurrency, formatDate, PAYMENT_LABELS } from './format'
import type { SaleWithItems } from '@/types/database'

/**
 * Texto plano do cupom (WhatsApp / copiar) — estilo mercado.
 */
export function buildReceiptText(
  sale: SaleWithItems,
  storeName = 'CaixaDoBairro',
): string {
  const lines: string[] = []
  const sep = '------------------------------'

  lines.push(storeName.toUpperCase())
  lines.push('CUPOM NAO FISCAL')
  lines.push(sep)
  lines.push(`Cupom: ${shortSaleId(sale.id)}`)
  lines.push(`Data:  ${formatDate(sale.created_at)}`)
  if (sale.customers?.full_name) {
    lines.push(`Cliente: ${sale.customers.full_name}`)
  }
  lines.push(sep)
  lines.push('PRODUTO')
  lines.push('QTD x UNIT.                  TOTAL')

  for (const item of sale.sale_items) {
    const name = (item.products?.name ?? item.item_description ?? 'Produto').toUpperCase()
    const code = item.products?.code
    lines.push(name)
    if (code) lines.push(`  Cod ${code}`)
    const qty = item.quantity
    const unit = formatCurrency(item.unit_price)
    const sub = formatCurrency(item.subtotal)
    lines.push(`${qty} x ${unit}`.padEnd(22, ' ') + sub.padStart(10, ' '))
  }

  lines.push(sep)
  lines.push(`TOTAL: ${formatCurrency(sale.total_amount)}`)
  lines.push(
    `Pagamento: ${PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}`,
  )

  if (sale.notes) {
    lines.push(sep)
    lines.push(`Obs: ${sale.notes}`)
  }

  lines.push(sep)
  lines.push('Obrigado e volte sempre!')

  return lines.join('\n')
}

export function shortSaleId(id: string): string {
  return id.replace(/-/g, '').slice(-8).toUpperCase()
}
