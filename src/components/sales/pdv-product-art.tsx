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

const PALETTES = [
  { bg: 'from-rose-600 to-red-800', ring: 'ring-rose-300/40', icon: 'text-rose-100' },
  { bg: 'from-amber-500 to-orange-700', ring: 'ring-amber-200/40', icon: 'text-amber-50' },
  { bg: 'from-sky-500 to-blue-800', ring: 'ring-sky-200/40', icon: 'text-sky-50' },
  { bg: 'from-emerald-500 to-teal-800', ring: 'ring-emerald-200/40', icon: 'text-emerald-50' },
  { bg: 'from-violet-500 to-purple-800', ring: 'ring-violet-200/40', icon: 'text-violet-50' },
  { bg: 'from-fuchsia-500 to-pink-800', ring: 'ring-fuchsia-200/40', icon: 'text-fuchsia-50' },
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

interface PdvProductArtProps {
  name: string
  className?: string
}

/** Decorative product placeholder — products have no photo column yet. */
export function PdvProductArt({ name, className = '' }: PdvProductArtProps) {
  const palette = PALETTES[hashName(name || 'item') % PALETTES.length]
  const Icon = pickIcon(name)

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ${palette.bg} ring-1 ${palette.ring} shadow-inner ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.22),transparent_55%)]" />
      <div className="absolute -bottom-6 -right-6 h-28 w-28 rounded-full bg-black/15" />
      <Icon className={`relative h-[46%] w-[46%] drop-shadow-lg ${palette.icon}`} strokeWidth={1.4} />
    </div>
  )
}
