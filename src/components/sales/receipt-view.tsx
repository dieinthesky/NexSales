'use client'

import Link from 'next/link'
import { ArrowLeft, Printer, MessageCircle, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { buildReceiptText, shortSaleId } from '@/lib/utils/receipt'
import { formatCurrency, formatDate, PAYMENT_LABELS } from '@/lib/utils/format'
import type { SaleWithItems } from '@/types/database'

interface ReceiptViewProps {
  sale: SaleWithItems
  storeName?: string
}

export function ReceiptView({ sale, storeName = 'VendasApp' }: ReceiptViewProps) {
  function handlePrint() {
    window.print()
  }

  function handleWhatsApp() {
    const text = buildReceiptText(sale, storeName)
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildReceiptText(sale, storeName))
      toast.success('Recibo copiado para a área de transferência')
    } catch {
      toast.error('Não foi possível copiar. Tente imprimir.')
    }
  }

  return (
    <div className="receipt-screen">
      {/* Page-wide styles: 80mm layout + hide everything else during print */}
      <style jsx global>{`
        @media print {
          /* Hide the dashboard chrome (sidebar/header) */
          body > * {
            visibility: hidden;
          }
          .receipt-print-area,
          .receipt-print-area * {
            visibility: visible;
          }
          .receipt-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            padding: 0;
            margin: 0;
          }
          .receipt-no-print {
            display: none !important;
          }
          @page {
            size: 80mm auto;
            margin: 4mm;
          }
        }
      `}</style>

      {/* Toolbar — visible on screen, hidden when printing */}
      <div className="receipt-no-print mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
          <Link href={`/vendas/${sale.id}`}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Voltar para a venda
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handlePrint} className="bg-primary hover:bg-primary/90 text-white">
            <Printer className="h-4 w-4 mr-1.5" />
            Imprimir
          </Button>
          <Button onClick={handleWhatsApp} className="bg-green-600 hover:bg-green-700 text-white">
            <MessageCircle className="h-4 w-4 mr-1.5" />
            WhatsApp
          </Button>
          <Button onClick={handleCopy} variant="outline" className="border-slate-200">
            <Copy className="h-4 w-4 mr-1.5" />
            Copiar texto
          </Button>
        </div>
      </div>

      {/* Printable receipt — 80mm preview centered on screen */}
      <div className="receipt-print-area mx-auto w-fit bg-white shadow-2xl rounded-sm print:shadow-none print:rounded-none">
        <ReceiptBody sale={sale} storeName={storeName} />
      </div>

      <p className="receipt-no-print mt-6 text-center text-xs text-slate-400">
        Dica: na hora de imprimir, escolha sua impressora térmica e papel 80mm.
        Para salvar como PDF, selecione &ldquo;Microsoft Print to PDF&rdquo; ou &ldquo;Salvar como PDF&rdquo;.
      </p>
    </div>
  )
}

function ReceiptBody({ sale, storeName }: { sale: SaleWithItems; storeName: string }) {
  const isFiado = sale.payment_method === 'fiado'
  const customerName = sale.customers?.full_name

  return (
    <div
      className="font-mono text-[11px] leading-relaxed text-black p-4"
      style={{ width: '80mm', maxWidth: '100%' }}
    >
      {/* Cabeçalho */}
      <div className="text-center mb-2">
        <p className="text-[9px] tracking-[0.3em] text-gray-400">━━━━━━━━━━━━━━━━━━━━━━</p>
        <p className="text-base font-bold uppercase tracking-[0.2em] mt-1">{storeName}</p>
        <p className="text-[9px] text-gray-500 tracking-widest uppercase mt-0.5">
          {isFiado ? '— Compra Fiada —' : '— Comprovante de Venda —'}
        </p>
        <p className="text-[9px] tracking-[0.3em] text-gray-400 mt-1">━━━━━━━━━━━━━━━━━━━━━━</p>
      </div>

      {/* Dados da venda */}
      <div className="text-[10px] space-y-0.5 mb-2">
        <div className="flex justify-between">
          <span className="text-gray-500">Nº Venda</span>
          <span className="font-semibold">{shortSaleId(sale.id)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Data</span>
          <span>{formatDate(sale.created_at)}</span>
        </div>
        {customerName && (
          <div className="flex justify-between">
            <span className="text-gray-500">Cliente</span>
            <span className="font-semibold text-right max-w-[55%] leading-tight">{customerName}</span>
          </div>
        )}
      </div>

      <Separator />

      {/* Itens */}
      <div className="text-[9px] text-gray-500 flex justify-between mb-1 uppercase tracking-wide">
        <span className="flex-1">Produto</span>
        <span className="w-6 text-center">Qtd</span>
        <span className="w-14 text-right">Unit.</span>
        <span className="w-14 text-right">Total</span>
      </div>

      <div className="space-y-1.5 mb-1">
        {sale.sale_items.map((item) => (
          <div key={item.id} className="flex justify-between items-start gap-1">
            <div className="flex-1 min-w-0">
              <p className="font-medium leading-tight break-words">
                {item.products?.name ?? 'Produto removido'}
              </p>
            </div>
            <span className="w-6 text-center shrink-0">{item.quantity}</span>
            <span className="w-14 text-right shrink-0 whitespace-nowrap">
              {formatCurrency(item.unit_price)}
            </span>
            <span className="w-14 text-right shrink-0 whitespace-nowrap font-bold">
              {formatCurrency(item.subtotal)}
            </span>
          </div>
        ))}
      </div>

      <Separator />

      {/* Total */}
      <div className="flex justify-between items-baseline mb-1">
        <span className="font-bold text-sm tracking-wide">TOTAL</span>
        <span className="font-bold text-lg">{formatCurrency(sale.total_amount)}</span>
      </div>

      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-gray-500">Pagamento</span>
        <span className="font-semibold uppercase tracking-wide">
          {PAYMENT_LABELS[sale.payment_method]}
        </span>
      </div>

      {/* Observações */}
      {sale.notes && (
        <>
          <Separator />
          <div className="text-[10px]">
            <p className="text-gray-500 mb-0.5">Obs.:</p>
            <p className="break-words">{sale.notes}</p>
          </div>
        </>
      )}

      {/* Assinatura do comprador (somente fiado) */}
      {isFiado && (
        <>
          <Separator />
          <div className="text-[10px] pt-1">
            <p className="text-gray-500 mb-6">Declaro que recebi os itens acima:</p>
            <div className="border-t border-black pt-1 mx-2 text-center">
              <p className="text-[9px] text-gray-500">Assinatura do comprador</p>
              {customerName && (
                <p className="text-[9px] font-medium mt-0.5">{customerName}</p>
              )}
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* Rodapé */}
      <div className="text-center space-y-0.5 pb-1">
        <p className="text-[10px] font-semibold">Obrigado pela preferência!</p>
        <p className="text-[9px] text-gray-400 tracking-[0.3em]">━━━━━━━━━━━━━━━━━━━━━━</p>
      </div>
    </div>
  )
}

function Separator() {
  return (
    <div className="my-2 border-t border-dashed border-gray-300" aria-hidden="true" />
  )
}
