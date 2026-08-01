'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'

const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  produtos: 'Produtos',
  categorias: 'Categorias',
  visita: 'Visita / Inventário',
  lojas: 'Lojas',
  novo: 'Novo',
  vendas: 'Vendas',
  nova: 'Nova Venda',
}

function labelFor(segment: string): string {
  if (LABELS[segment]) return LABELS[segment]
  if (/^[0-9a-f-]{8,}$/i.test(segment)) return 'Detalhes'
  return segment.charAt(0).toUpperCase() + segment.slice(1)
}

export function Breadcrumb() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-sm">
      <Link
        href="/dashboard"
        className="flex items-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {segments.map((segment, index) => {
        const href = '/' + segments.slice(0, index + 1).join('/')
        const isLast = index === segments.length - 1
        return (
          <span key={href} className="flex items-center">
            <ChevronRight className="h-3.5 w-3.5 mx-1.5 text-slate-300 dark:text-slate-600" />
            {isLast ? (
              <span className="font-medium text-slate-900 dark:text-slate-100">{labelFor(segment)}</span>
            ) : (
              <Link
                href={href}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                {labelFor(segment)}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
