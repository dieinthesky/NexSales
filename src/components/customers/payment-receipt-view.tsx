'use client'

import Link from 'next/link'
import { ArrowLeft, Printer, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/format'
import type { PaymentReceiptData } from '@/lib/queries/customers'

interface PaymentReceiptViewProps {
  data: PaymentReceiptData
  storeName?: string
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildWhatsAppText(data: PaymentReceiptData, storeName: string): string {
  const { payment, customer, remainingDebt } = data
  const lines = [
    `*${storeName}*`,
    `*COMPROVANTE DE PAGAMENTO*`,
    ``,
    `Cliente: ${customer.full_name}`,
    `Valor pago: ${formatCurrency(payment.amount)}`,
    `Data: ${formatDateTime(payment.created_at)}`,
    payment.notes ? `Obs: ${payment.notes}` : '',
    ``,
    remainingDebt > 0
      ? `Saldo restante: ${formatCurrency(remainingDebt)}`
      : `✅ Débito quitado!`,
  ]
  return lines.filter(Boolean).join('\n')
}

export function PaymentReceiptView({ data, storeName = 'VendasApp' }: PaymentReceiptViewProps) {
  const { payment, customer, remainingDebt } = data
  const isFullyPaid = remainingDebt <= 0

  function handlePrint() {
    window.print()
  }

  function handleWhatsApp() {
    const digits = customer.phone?.replace(/\D/g, '') ?? ''
    // Evita 5555… quando o telefone já está salvo com DDI 55.
    const phone =
      digits.startsWith('55') && digits.length >= 12 ? digits : digits ? `55${digits}` : ''
    const text = buildWhatsAppText(data, storeName)
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="receipt-screen">
      <style jsx global>{`
        @media print {
          body > * { visibility: hidden; }
          .receipt-print-area,
          .receipt-print-area * { visibility: visible; }
          .receipt-print-area {
            position: absolute;
            left: 0; top: 0;
            width: 80mm;
            padding: 0; margin: 0;
          }
          .receipt-no-print { display: none !important; }
          @page { size: 80mm auto; margin: 4mm; }
        }
      `}</style>

      {/* ── Action bar (hidden on print) ── */}
      <div className="receipt-no-print max-w-sm mx-auto px-4 pt-6 pb-3 space-y-3">
        <Link href={`/clientes/${customer.id}`}>
          <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900 -ml-2">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar ao cliente
          </Button>
        </Link>

        <div className="flex gap-2">
          <Button onClick={handlePrint} className="flex-1 bg-slate-800 hover:bg-slate-900 text-white">
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
          <Button onClick={handleWhatsApp} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
            <MessageCircle className="mr-2 h-4 w-4" />
            WhatsApp
          </Button>
        </div>
      </div>

      {/* ── Receipt ── */}
      <div className="receipt-print-area max-w-[80mm] mx-auto px-4 pb-8 font-mono text-[11px] leading-snug text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="text-center py-3 space-y-0.5">
          <p className="text-xs font-bold tracking-widest uppercase">{storeName}</p>
          <p className="text-[9px] text-slate-400 dark:text-slate-500 tracking-wider">* * * * * * * * * * * * *</p>
          <p className="font-bold text-sm">COMPROVANTE DE PAGAMENTO</p>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 tracking-wide">— FIADO —</p>
        </div>

        <p className="text-[9px] text-slate-400 dark:text-slate-500 tracking-wider text-center mb-3">* * * * * * * * * * * * *</p>

        {/* Customer */}
        <div className="space-y-1 mb-3">
          <p><span className="font-semibold">Cliente:</span> {customer.full_name}</p>
          {customer.phone && <p><span className="font-semibold">Tel:</span> {customer.phone}</p>}
          <p><span className="font-semibold">Data:</span> {formatDateTime(payment.created_at)}</p>
        </div>

        <p className="text-[9px] text-slate-300 dark:text-slate-600">- - - - - - - - - - - - - - - - - - -</p>

        {/* Payment amount */}
        <div className="py-3 text-center">
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Valor pago</p>
          <p className="text-3xl font-bold">{formatCurrency(payment.amount)}</p>
        </div>

        <p className="text-[9px] text-slate-300 dark:text-slate-600">- - - - - - - - - - - - - - - - - - -</p>

        {/* Balance */}
        <div className="py-2 space-y-1">
          {isFullyPaid ? (
            <p className="text-center font-bold text-[14px] text-emerald-600 dark:text-emerald-400">✓ DÉBITO QUITADO</p>
          ) : (
            <div className="flex justify-between items-center">
              <span className="font-semibold">Saldo devedor:</span>
              <span className="font-bold text-[13px] text-amber-600 dark:text-amber-400">{formatCurrency(remainingDebt)}</span>
            </div>
          )}
        </div>

        {payment.notes && (
          <>
            <p className="text-[9px] text-slate-300 dark:text-slate-600">- - - - - - - - - - - - - - - - - - -</p>
            <p className="py-1.5"><span className="font-semibold">Obs:</span> {payment.notes}</p>
          </>
        )}

        <p className="text-[9px] text-slate-300 dark:text-slate-600 mt-2">- - - - - - - - - - - - - - - - - - -</p>

        {/* Footer */}
        <div className="text-center pt-2 pb-1 space-y-1">
          <p className="text-[9px] text-slate-500 dark:text-slate-400">Guarde este comprovante</p>
          <p className="text-[9px] text-slate-400 dark:text-slate-500">{storeName} — obrigado!</p>
        </div>
      </div>
    </div>
  )
}
