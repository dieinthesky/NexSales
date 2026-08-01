'use client'

import {
  Package,
  ShoppingBag,
  Droplets,
  Cookie,
  Milk,
  Wine,
  Tag,
  type LucideIcon,
} from 'lucide-react'

const THEMES = [
  {
    bg: 'bg-slate-100',
    tile: 'bg-[#1e3a5f]',
    mark: 'text-[#1e3a5f]',
    ring: 'ring-slate-200',
  },
  {
    bg: 'bg-emerald-50',
    tile: 'bg-emerald-700',
    mark: 'text-emerald-800',
    ring: 'ring-emerald-100',
  },
  {
    bg: 'bg-sky-50',
    tile: 'bg-sky-700',
    mark: 'text-sky-800',
    ring: 'ring-sky-100',
  },
  {
    bg: 'bg-violet-50',
    tile: 'bg-violet-700',
    mark: 'text-violet-800',
    ring: 'ring-violet-100',
  },
  {
    bg: 'bg-amber-50',
    tile: 'bg-amber-700',
    mark: 'text-amber-900',
    ring: 'ring-amber-100',
  },
] as const

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h
}

function pickIcon(name: string): LucideIcon {
  const n = name.toLowerCase()
  if (!n || n.includes('avulso')) return Tag
  if (/(coca|refri|suco|água|agua|bebida|guaran)/.test(n)) return Droplets
  if (/(cerveja|vinho|whisky|vodka|drink)/.test(n)) return Wine
  if (/(leite|iogurte|queijo|latic)/.test(n)) return Milk
  if (/(biscoito|bolacha|doce|chocolate|snack|salgado)/.test(n)) return Cookie
  if (/(sacola|kit|pack|cesta)/.test(n)) return ShoppingBag
  return Package
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

interface PdvProductArtProps {
  name: string
  className?: string
}

/** Placeholder limpo até existir foto real no cadastro. */
export function PdvProductArt({ name, className = '' }: PdvProductArtProps) {
  const theme = THEMES[hashName(name || 'item') % THEMES.length]
  const Icon = pickIcon(name)
  const mark = initials(name)

  return (
    <div
      className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl ${theme.bg} ring-1 ${theme.ring} ${className}`}
      aria-hidden="true"
    >
      <div
        className={`flex h-28 w-28 items-center justify-center rounded-3xl shadow-md sm:h-36 sm:w-36 ${theme.tile}`}
      >
        <Icon className="h-14 w-14 text-white sm:h-16 sm:w-16" strokeWidth={1.5} />
      </div>
      <p className={`mt-4 text-xl font-black tracking-[0.2em] ${theme.mark}`}>{mark}</p>
      <p className="mt-2 max-w-[92%] px-3 text-center text-sm font-medium leading-snug text-slate-600 line-clamp-3">
        {name}
      </p>
    </div>
  )
}
