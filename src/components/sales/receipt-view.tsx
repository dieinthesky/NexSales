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

export function ReceiptView({ sale, storeName = 'CaixaDoBairro' }: ReceiptViewProps) {
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
      toast.success('Recibo copiado')
    } catch {
      toast.error('Não foi possível copiar. Tente imprimir.')
    }
  }

  return (
    <div className="receipt-screen">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          body > * { visibility: hidden; }
          .receipt-print-area, .receipt-print-area * { visibility: visible; }
          .receipt-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            padding: 0;
            margin: 0;
          }
          .receipt-no-print { display: none !important; }
          @page { size: 80mm auto; margin: 3mm; }
        }
      `,
        }}
      />

      <div className="receipt-no-print mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
          <Link href={`/vendas/${sale.id}`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar para a venda
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handlePrint} className="bg-primary text-white hover:bg-primary/90">
            <Printer className="mr-1.5 h-4 w-4" />
            Imprimir cupom
          </Button>
          <Button onClick={handleWhatsApp} className="bg-green-600 text-white hover:bg-green-700">
            <MessageCircle className="mr-1.5 h-4 w-4" />
            WhatsApp
          </Button>
          <Button onClick={() => void handleCopy()} variant="outline">
            <Copy className="mr-1.5 h-4 w-4" />
            Copiar
          </Button>
        </div>
      </div>

      <div className="receipt-print-area mx-auto w-fit rounded-sm bg-white shadow-2xl print:rounded-none print:shadow-none">
        <ReceiptBody sale={sale} storeName={storeName} />
      </div>
    </div>
  )
}

function ReceiptBody({ sale, storeName }: { sale: SaleWithItems; storeName: string }) {
  const isFiado = sale.payment_method === 'fiado'
  const customerName = sale.customers?.full_name
  const itemCount = sale.sale_items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div
      className="p-4 font-mono text-[11px] leading-snug text-black"
      style={{ width: '80mm', maxWidth: '100%' }}
    >
      <div className="mb-2 text-center">
        <p className="text-base font-black uppercase tracking-wide">{storeName}</p>
        <p className="mt-0.5 text-[10px] text-gray-600">
          {isFiado ? 'CUPOM · COMPRA FIADA' : 'CUPOM NÃO FISCAL'}
        </p>
        <p className="mt-1 text-[10px] tracking-widest text-gray-400">
          ----------------------------------------
        </p>
      </div>

      <div className="mb-2 space-y-0.5 text-[10px]">
        <div className="flex justify-between gap-2">
          <span>Cupom</span>
          <span className="font-semibold">{shortSaleId(sale.id)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Data</span>
          <span>{formatDate(sale.created_at)}</span>
        </div>
        {customerName ? (
          <div className="flex justify-between gap-2">
            <span>Cliente</span>
            <span className="max-w-[58%] text-right font-semibold leading-tight">
              {customerName}
            </span>
          </div>
        ) : null}
      </div>

      <p className="mb-1 text-[10px] tracking-widest text-gray-400">
        ----------------------------------------
      </p>

      {/* Cabeçalho estilo mercado */}
      <div className="mb-1 flex gap-1 text-[9px] font-bold uppercase text-gray-600">
        <span className="flex-1">Descrição</span>
        <span className="w-8 text-center">Qtd</span>
        <span className="w-16 text-right">R$ Unit</span>
        <span className="w-16 text-right">R$ Tot</span>
      </div>

      <div className="mb-1 space-y-2">
        {sale.sale_items.map((item) => {
          const name = item.products?.name ?? item.item_description ?? 'Produto'
          const code = item.products?.code
          return (
            <div key={item.id}>
              <p className="text-[11px] font-semibold uppercase leading-tight">{name}</p>
              {code ? (
                <p className="text-[9px] text-gray-500">Cód {code}</p>
              ) : null}
              <div className="mt-0.5 flex items-end gap-1 text-[11px]">
                <span className="w-8 shrink-0 text-center tabular-nums">{item.quantity}</span>
                <span className="w-16 shrink-0 text-right tabular-nums">
                  {formatCurrency(item.unit_price)}
                </span>
                <span className="ml-auto w-16 shrink-0 text-right font-bold tabular-nums">
                  {formatCurrency(item.subtotal)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <p className="my-1 text-[10px] tracking-widest text-gray-400">
        ----------------------------------------
      </p>

      <div className="mb-1 flex justify-between text-[10px]">
        <span>Itens</span>
        <span className="tabular-nums">{itemCount}</span>
      </div>

      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-black">TOTAL</span>
        <span className="text-xl font-black tabular-nums">
          {formatCurrency(sale.total_amount)}
        </span>
      </div>

      <div className="mb-2 flex justify-between text-[10px]">
        <span>Forma de pagamento</span>
        <span className="font-bold uppercase">
          {PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}
        </span>
      </div>

      {sale.notes ? (
        <>
          <p className="text-[10px] tracking-widest text-gray-400">
            ----------------------------------------
          </p>
          <p className="text-[10px]">
            <span className="text-gray-500">Obs: </span>
            {sale.notes}
          </p>
        </>
      ) : null}

      {isFiado ? (
        <>
          <p className="my-2 text-[10px] tracking-widest text-gray-400">
            ----------------------------------------
          </p>
          <p className="mb-8 text-[10px] text-gray-600">
            Declaro ter recebido os produtos acima e assumo o pagamento:
          </p>
          <div className="mx-2 border-t border-black pt-1 text-center">
            <p className="text-[9px] text-gray-500">Assinatura do comprador</p>
            {customerName ? (
              <p className="mt-0.5 text-[9px] font-medium">{customerName}</p>
            ) : null}
          </div>
        </>
      ) : null}

      <p className="mt-3 text-[10px] tracking-widest text-gray-400">
        ----------------------------------------
      </p>
      <p className="text-center text-[10px] font-semibold">Obrigado e volte sempre!</p>
      <p className="mt-0.5 text-center text-[9px] text-gray-500">CaixaDoBairro</p>
    </div>
  )
}
