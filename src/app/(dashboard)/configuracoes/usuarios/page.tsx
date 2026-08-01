import { ShieldCheck, User as UserIcon, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/roles'
import { displayName, initials } from '@/lib/utils/user-display'
import { emailToUsername, isInternalEmail } from '@/lib/supabase/service'
import { UserRoleSelect } from './user-role-select'
import { CreateEmployeeDialog } from './create-employee-dialog'
import { UserActions } from './user-actions'
import { SavedProfilesManager } from './saved-profiles-manager'

export const metadata = {
  title: 'Usuários',
}

interface AdminUserRow {
  user_id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: 'master' | 'admin' | 'employee'
  created_at: string
  last_sign_in_at: string | null
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function UsuariosPage() {
  const current = await requireAdmin()

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_list_users')

  const users: AdminUserRow[] = (data ?? []) as AdminUserRow[]
  const canGrantAdmin = current.role === 'master'
  const adminCount = users.filter((u) => u.role === 'admin' || u.role === 'master').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            Usuários
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {canGrantAdmin
              ? 'Gerencie lojas, donos e funcionários. Contas Master não aparecem para clientes.'
              : 'Crie e gerencie os funcionários da sua loja.'}
          </p>
        </div>
        <CreateEmployeeDialog />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 p-3 flex flex-col items-center text-center gap-1.5">
          <div className="h-8 w-8 rounded-lg bg-primary/5 dark:bg-primary/10 text-primary flex items-center justify-center">
            <Users className="h-4 w-4" />
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-tight">
            Total
          </p>
          <p className="text-xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums leading-none">
            {users.length}
          </p>
        </Card>
        <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 p-3 flex flex-col items-center text-center gap-1.5">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-tight">
            Admins
          </p>
          <p className="text-xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums leading-none">
            {adminCount}
          </p>
        </Card>
        <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 p-3 flex flex-col items-center text-center gap-1.5">
          <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-white/8 text-slate-600 dark:text-slate-400 flex items-center justify-center">
            <UserIcon className="h-4 w-4" />
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-tight">
            Funcionários
          </p>
          <p className="text-xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums leading-none">
            {users.length - adminCount}
          </p>
        </Card>
      </div>

      <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 shadow-sm overflow-hidden">
        {error ? (
          <div className="p-6 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-b border-red-100 dark:border-red-500/20">
            Erro ao carregar usuários: {error.message}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 h-11">
                  Usuário
                </TableHead>
                <TableHead className="hidden sm:table-cell text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Cadastrado em
                </TableHead>
                <TableHead className="hidden md:table-cell text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Último acesso
                </TableHead>
                <TableHead className="hidden sm:table-cell text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-right">
                  Papel
                </TableHead>
                <TableHead className="w-12 text-right pr-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="text-center py-12 text-slate-400 dark:text-slate-500">
                    Nenhum usuário cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u, idx) => {
                  const isSelf = u.user_id === current.id
                  const name = displayName({
                    firstName: u.first_name,
                    lastName: u.last_name,
                    email: u.email,
                  })
                  const ini = initials({
                    firstName: u.first_name,
                    lastName: u.last_name,
                    email: u.email,
                  })
                  return (
                    <TableRow
                      key={u.user_id}
                      className={`border-slate-100 dark:border-white/5 hover:bg-slate-50/70 dark:hover:bg-white/5 transition-colors ${
                        idx % 2 === 1 ? 'bg-slate-50/30 dark:bg-white/2' : ''
                      }`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-xs font-semibold shadow-sm"
                            aria-hidden
                          >
                            {ini}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                                {name}
                              </span>
                              {isSelf ? (
                                <span className="inline-flex items-center rounded-md bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary/80 ring-1 ring-inset ring-primary/20">
                                  você
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {isInternalEmail(u.email)
                                ? `@${emailToUsername(u.email)}`
                                : u.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatDate(u.created_at)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatDate(u.last_sign_in_at)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-right">
                        <UserRoleSelect
                          userId={u.user_id}
                          role={u.role}
                          isSelf={isSelf}
                          canGrantAdmin={canGrantAdmin}
                        />
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        {u.role === 'master' && !canGrantAdmin ? null : (
                          <UserActions
                            userId={u.user_id}
                            userName={name}
                            isSelf={isSelf}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/3 text-xs text-slate-500 dark:text-slate-400">
          Funcionários entram com o <strong className="text-slate-700 dark:text-slate-300">usuário</strong> e senha definidos aqui.
          {canGrantAdmin
            ? ' Só a conta Master pode criar ou promover outros administradores.'
            : ' Como dono da loja, você só cria funcionários — não outras contas admin.'}
        </div>
      </Card>

      <SavedProfilesManager />
    </div>
  )
}
