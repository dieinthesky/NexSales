'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Tags,
  ShoppingBag,
  Users,
  Mail,
  MonitorDown,
  BarChart3,
  Menu,
  UserRound,
  Sun,
  Moon,
  Store,
  ClipboardList,
  QrCode,
  BadgePercent,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import type { UserRole } from '@/types/database'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  adminOnly?: boolean
  masterOnly?: boolean
  desktopOnly?: boolean
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: 'Menu',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
      { href: '/produtos', label: 'Produtos', icon: Package, adminOnly: true },
      { href: '/produtos/visita', label: 'Visita / Inventário', icon: ClipboardList, adminOnly: true },
      { href: '/produtos/categorias', label: 'Categorias', icon: Tags, adminOnly: true },
    ],
  },
  {
    title: 'Vendas',
    items: [
      { href: '/vendas/nova', label: 'Nova Venda', icon: ShoppingBag },
      { href: '/vendas', label: 'Histórico', icon: ShoppingCart },
      { href: '/clientes', label: 'Clientes / Fiado', icon: UserRound },
    ],
  },
  {
    title: 'Administração',
    items: [
      { href: '/configuracoes/usuarios', label: 'Usuários', icon: Users, adminOnly: true },
      { href: '/configuracoes/lojas', label: 'Lojas', icon: Store, masterOnly: true },
      { href: '/configuracoes/pix', label: 'PIX da loja', icon: QrCode, adminOnly: true },
      { href: '/relatorios', label: 'Relatório de lucro', icon: BarChart3, adminOnly: true },
      { href: '/configuracoes/relatorio', label: 'Relatório por email', icon: Mail, adminOnly: true },
      { href: '/planos', label: 'Planos e suporte', icon: BadgePercent },
      { href: '/configuracoes/baixar', label: 'Baixar app', icon: MonitorDown, desktopOnly: true },
    ],
  },
]

function setThemeCookie(value: 'dark' | 'light') {
  document.cookie = `theme=${value}; path=/; max-age=31536000; SameSite=Lax`
}

function useTheme() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const html = document.documentElement
    const currentlyDark = html.classList.contains('dark')

    // If no theme cookie is set, respect the system preference
    const hasCookie = /(?:^|;\s*)theme=/.test(document.cookie)
    if (!hasCookie) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (prefersDark !== currentlyDark) {
        html.classList.toggle('dark', prefersDark)
        setDark(prefersDark)
        return
      }
    }

    setDark(currentlyDark)
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    setThemeCookie(next ? 'dark' : 'light')
  }

  return { dark, toggle }
}

function isItemActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  if (href === '/relatorios') return pathname.startsWith('/relatorios')
  if (href === '/vendas') {
    if (pathname.startsWith('/vendas/nova')) return false
    return pathname === '/vendas' || /^\/vendas\/[^/]+$/.test(pathname)
  }
  if (href === '/produtos') {
    return (
      pathname === '/produtos' ||
      (pathname.startsWith('/produtos/') &&
        !pathname.startsWith('/produtos/categorias') &&
        !pathname.startsWith('/produtos/visita'))
    )
  }
  if (href === '/configuracoes/lojas') {
    return pathname.startsWith('/configuracoes/lojas')
  }
  return pathname.startsWith(href)
}

const sectionVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045 } },
}

const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.22, ease: 'easeOut' as const },
  },
}

interface NavListProps {
  role: UserRole
  onNavigate?: () => void
  isMobile?: boolean
}

function NavList({ role, onNavigate, isMobile }: NavListProps) {
  const pathname = usePathname()

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          (!item.adminOnly || role === 'admin' || role === 'master') &&
          (!item.masterOnly || role === 'master') &&
          (!item.desktopOnly || !isMobile)
      ),
    }))
    .filter((section) => section.items.length > 0)

  return (
    <nav className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
      {visibleSections.map((section) => (
        <motion.div
          key={section.title}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
        >
          <p className="px-3 mb-2 text-[10px] font-semibold tracking-[0.12em] uppercase text-slate-500">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon
              const isActive = isItemActive(item.href, pathname)

              return (
                <motion.li key={item.href} className="relative" variants={itemVariants}>
                  <AnimatePresence>
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-active-indicator"
                        aria-hidden
                        className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-primary/90"
                        initial={false}
                        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      />
                    )}
                  </AnimatePresence>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-slate-800/80 text-white'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-100'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-[18px] w-[18px] shrink-0 transition-colors',
                        isActive ? 'text-primary/70' : 'text-slate-500'
                      )}
                    />
                    <span>{item.label}</span>
                  </Link>
                </motion.li>
              )
            })}
          </ul>
        </motion.div>
      ))}
    </nav>
  )
}

function SidebarBrand() {
  return (
    <div className="px-6 py-5 border-b border-slate-800">
      <Link href="/dashboard" className="flex items-center gap-2.5 group">
        <motion.div
          whileHover={{ scale: 1.08 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shadow-md shadow-primary/20 ring-1 ring-white/10 shrink-0"
        >
          <Store className="h-5 w-5 text-white" strokeWidth={2} />
        </motion.div>
        <div className="flex flex-col leading-tight">
          <span className="font-semibold text-white text-base tracking-tight">CaixaDoBairro</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">PDV do Bairro</span>
        </div>
      </Link>
    </div>
  )
}

function SidebarFooter({ role }: { role: UserRole }) {
  const { dark, toggle } = useTheme()

  return (
    <div className="px-4 py-4 border-t border-slate-800">
      <div className="rounded-lg bg-slate-800/50 px-3 py-2.5 text-xs text-slate-400">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-slate-300">CaixaDoBairro v1.0</p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggle}
              aria-label={dark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
              className="h-6 w-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-slate-200 transition-colors"
            >
              {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            <span
              className={cn(
                'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset',
                role === 'master'
                  ? 'bg-amber-500/15 text-amber-300 ring-amber-400/30'
                  : role === 'admin'
                    ? 'bg-primary/10 text-primary/60 ring-primary/30'
                    : 'bg-slate-700/50 text-slate-300 ring-slate-500/20',
              )}
            >
              {role === 'master' ? 'Master' : role === 'admin' ? 'Admin' : 'Funcionário'}
            </span>
          </div>
        </div>
        <p className="text-slate-500 mt-0.5">Operacional</p>
      </div>
    </div>
  )
}

interface SidebarProps {
  role: UserRole
}

export function Sidebar({ role }: SidebarProps) {
  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="hidden md:flex w-64 min-h-screen bg-slate-900 text-slate-100 flex-col border-r border-slate-800"
    >
      <SidebarBrand />
      <NavList role={role} />
      <SidebarFooter role={role} />
    </motion.aside>
  )
}

export function MobileSidebar({ role }: SidebarProps) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Abrir menu"
        className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-64 max-w-[80vw] bg-slate-900 text-slate-100 p-0 border-r border-slate-800"
      >
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
        <SidebarBrand />
        <NavList role={role} onNavigate={() => setOpen(false)} isMobile />
        <SidebarFooter role={role} />
      </SheetContent>
    </Sheet>
  )
}
