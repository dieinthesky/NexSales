import { formatCurrency, formatDate } from './format'

/** A single line of a printable receipt. */
export interface PrintReceiptItem {
  name: string
  quantity: number
  unit_price: number
}

/** Everything needed to render an 80mm thermal receipt without a server. */
export interface PrintReceiptData {
  storeName?: string
  items: PrintReceiptItem[]
  total: number
  paymentLabel: string
  notes?: string
  /** When the sale happened. Defaults to now if omitted. */
  date?: Date
  /**
   * Marks the receipt as not-yet-confirmed by the server (offline sale).
   * Adds a visible "PROVISÓRIO" warning so the customer/cashier knows the
   * official receipt comes after sync.
   */
  provisional?: boolean
}

/**
 * Opens a self-contained print window and triggers the browser print dialog
 * with an 80mm thermal layout. Works fully offline: the HTML is written inline
 * (no network, no routing, no server round-trip), so a cashier can print a
 * receipt for a sale that only exists in the local offline queue.
 *
 * Returns `false` when the print window could not be opened (e.g. a popup
 * blocker), so the caller can surface a fallback message.
 */
export function printReceipt(data: PrintReceiptData): boolean {
  const win = window.open('', '_blank', 'width=380,height=600')
  if (win) {
    win.document.open()
    win.document.write(buildReceiptHtml(data))
    win.document.close()
    return true
  }

  // Fallback for Electron (popup windows are blocked by default): load the
  // receipt HTML into a hidden iframe. The inline <script> in the HTML calls
  // window.print() on the iframe's own window, which prints just its content.
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:none;'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) { frame.remove(); return false }
  doc.open()
  doc.write(buildReceiptHtml(data))
  doc.close()
  // The iframe's afterprint handler calls window.close() which destroys the
  // frame. The timeout is a safety net in case afterprint never fires.
  setTimeout(() => frame.remove(), 8_000)
  return true
}

/** Builds the full standalone HTML document for the receipt. */
function buildReceiptHtml(data: PrintReceiptData): string {
  const storeName = data.storeName ?? 'VendasApp'
  const dateLabel = formatDate(data.date ?? new Date())

  const rows = data.items
    .map((item) => {
      const lineTotal = item.unit_price * item.quantity
      return `
        <div style="margin-bottom:6px">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="line">
            <span>${item.quantity} x ${escapeHtml(formatCurrency(item.unit_price))}</span>
            <span><strong>${escapeHtml(formatCurrency(lineTotal))}</strong></span>
          </div>
        </div>`
    })
    .join('')

  const provisionalBanner = data.provisional
    ? `<div class="provisional">RECIBO PROVISÓRIO<br/><span>Aguardando envio ao servidor</span></div>`
    : ''

  const notesBlock = data.notes
    ? `<div class="sep"></div><div class="notes"><strong>Obs:</strong> ${escapeHtml(data.notes)}</div>`
    : ''

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Recibo</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Courier New", ui-monospace, monospace;
    font-size: 11px;
    line-height: 1.3;
    color: #000;
    margin: 0;
    padding: 8px;
    width: 80mm;
  }
  .center { text-align: center; }
  .store { font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
  .sub { font-size: 10px; color: #333; margin-top: 2px; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .meta p { margin: 2px 0; font-size: 10px; }
  .item-name { font-weight: 700; text-transform: uppercase; font-size: 11px; }
  .item-code { font-size: 9px; color: #444; }
  .line { display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px; }
  .total { display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; }
  .pay { font-size: 11px; margin-top: 4px; }
  .notes { font-size: 10px; }
  .thanks { text-align: center; font-size: 11px; font-weight: 700; margin-top: 6px; }
  .provisional {
    text-align: center;
    border: 1px dashed #000;
    padding: 4px;
    margin-bottom: 6px;
    font-weight: 700;
    font-size: 11px;
  }
  .provisional span { font-weight: 400; font-size: 9px; }
</style>
</head>
<body>
  ${provisionalBanner}
  <div class="center"><span class="store">${escapeHtml(storeName)}</span></div>
  <div class="center sub">CUPOM NAO FISCAL</div>
  <div class="sep"></div>
  <div class="meta">
    <p><strong>Data:</strong> ${escapeHtml(dateLabel)}</p>
  </div>
  <div class="sep"></div>
  ${rows}
  <div class="sep"></div>
  <div class="total"><span>TOTAL</span><span>${escapeHtml(formatCurrency(data.total))}</span></div>
  <div class="pay"><strong>Pagamento:</strong> ${escapeHtml(data.paymentLabel)}</div>
  ${notesBlock}
  <div class="sep"></div>
  <p class="thanks">Obrigado e volte sempre!</p>
  <script>
    window.addEventListener('load', function () {
      window.focus();
      window.print();
      window.addEventListener('afterprint', function () { window.close(); });
    });
  </script>
</body>
</html>`
}

/** Escapes the five HTML-significant characters to prevent markup injection. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
