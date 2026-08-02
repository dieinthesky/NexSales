'use client'

import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/format'

export type LabelProduct = {
  id: string
  name: string
  code: string
  sale_price: number
  storeName?: string
}

export function ProductLabelPrint({ product }: { product: LabelProduct }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !product.code) return
    try {
      JsBarcode(svgRef.current, product.code, {
        format: 'CODE128',
        displayValue: true,
        fontSize: 12,
        height: 48,
        margin: 4,
        width: 1.6,
        background: '#ffffff',
        lineColor: '#0f172a',
      })
    } catch {
      // código inválido para o formato — mostra só o texto
    }
  }, [product.code])

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-lg space-y-4 p-4 print:max-w-none print:p-0">
        <div className="flex items-center justify-between gap-2 print:hidden">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Etiqueta de prateleira</h1>
            <p className="text-sm text-slate-500">Imprima em papel comum ou adesivo A6/Térmica.</p>
          </div>
          <Button
            type="button"
            className="bg-[#1e3a5f] hover:bg-[#234e7a]"
            onClick={() => window.print()}
          >
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
        </div>

        {/* Etiqueta — tamanho gôndola aproximado 90×50 mm em 96dpi ≈ 340×190 */}
        <div
          className="mx-auto flex flex-col items-center justify-between border-2 border-slate-900 bg-white p-4 text-center text-slate-900 shadow-sm print:shadow-none"
          style={{ width: '90mm', minHeight: '50mm' }}
        >
          {product.storeName && (
            <p className="w-full truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {product.storeName}
            </p>
          )}
          <p className="mt-1 line-clamp-3 w-full text-base font-bold leading-snug sm:text-lg">
            {product.name}
          </p>
          <p className="mt-2 text-3xl font-black tabular-nums tracking-tight sm:text-4xl">
            {formatCurrency(Number(product.sale_price))}
          </p>
          <div className="mt-2 flex w-full justify-center">
            {product.code ? (
              <svg ref={svgRef} className="max-w-full" />
            ) : (
              <p className="font-mono text-xs text-slate-500">Sem código</p>
            )}
          </div>
        </div>

        {/* Versão compacta 2ª etiqueta opcional */}
        <div
          className="mx-auto hidden border border-dashed border-slate-400 bg-white p-2 text-center print:block"
          style={{ width: '60mm', minHeight: '35mm' }}
        >
          <p className="line-clamp-2 text-xs font-bold leading-tight">{product.name}</p>
          <p className="mt-1 text-xl font-black tabular-nums">
            {formatCurrency(Number(product.sale_price))}
          </p>
          <p className="mt-1 font-mono text-[10px] text-slate-600">{product.code}</p>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page { margin: 8mm; size: auto; }
          body { background: white !important; }
          aside, nav, header, [data-sidebar] { display: none !important; }
        }
      `,
        }}
      />
    </div>
  )
}
