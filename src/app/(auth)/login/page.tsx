'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, AlertCircle, Eye, EyeOff, ArrowLeft, Plus, ShoppingBag, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loginSchema, type LoginFormData } from '@/lib/validations/auth.schema'
import { signIn } from './actions'
import {
  getRecentProfiles,
  saveProfile,
  removeProfile,
  getInitials,
  getAvatarGradient,
  type RecentProfile,
} from '@/lib/utils/recent-profiles'

type Mode = 'profiles' | 'profile-password' | 'full-form'

function LoginPageContent() {
  const [profiles, setProfiles] = useState<RecentProfile[]>([])
  const [mode, setMode] = useState<Mode>('full-form')
  const [selected, setSelected] = useState<string | null>(null)
  const [profilePwd, setProfilePwd] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isOfflineError, setIsOfflineError] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const passwordRef = useRef<HTMLInputElement>(null)

  // Redirect recovery links that land here to the correct reset page
  useEffect(() => {
    const code = searchParams.get('code')
    const type = searchParams.get('type')
    if (code && type === 'recovery') {
      router.replace(`/redefinir-senha?code=${code}`)
    }
  }, [searchParams, router])

  useEffect(() => {
    const saved = getRecentProfiles()
    if (saved.length > 0) {
      setProfiles(saved)
      setMode('profiles')
    }
  }, [])

  useEffect(() => {
    if (mode === 'profile-password') {
      setTimeout(() => passwordRef.current?.focus(), 60)
    }
  }, [mode])

  function handleProfileSelect(username: string) {
    setSelected(username)
    setProfilePwd('')
    setServerError(null)
    setIsOfflineError(false)
    setShowPassword(false)
    setMode('profile-password')
  }

  async function handleProfileLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !profilePwd || isSubmitting) return
    setIsSubmitting(true)
    setServerError(null)
    try {
      saveProfile(selected)
      const result = await signIn(selected, profilePwd)
      if (result?.error) {
        if (!result.offline) removeProfile(selected)
        setIsOfflineError(result.offline ?? false)
        setServerError(result.error)
      }
    } catch (err: unknown) {
      // Next.js redirect() throws NEXT_REDIRECT — login succeeded, keep the profile
      if (err instanceof Error && (err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) {
        throw err
      }
      removeProfile(selected)
    } finally {
      setIsSubmitting(false)
    }
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting: isFormSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(data: LoginFormData) {
    setServerError(null)
    try {
      saveProfile(data.username)
      const result = await signIn(data.username, data.password)
      if (result?.error) {
        if (!result.offline) removeProfile(data.username)
        setIsOfflineError(result.offline ?? false)
        setServerError(result.error)
      }
    } catch (err: unknown) {
      // Next.js redirect() throws NEXT_REDIRECT — login succeeded, keep the profile
      if (err instanceof Error && (err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) {
        throw err
      }
      removeProfile(data.username)
    }
  }

  const MobileBrand = () => (
    <div className="flex lg:hidden items-center gap-2.5 mb-10">
      <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shadow-md shadow-primary/20">
        <ShoppingBag className="h-5 w-5 text-white" strokeWidth={2} />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="font-bold text-slate-900">CaixaDoBairro</span>
        <span className="text-[9px] uppercase tracking-widest text-slate-400">PDV do Bairro</span>
      </div>
    </div>
  )

  /* ── Mode: profile selection ─────────────────────────────────────── */
  if (mode === 'profiles') {
    return (
      <div className="w-full max-w-xs">
        <MobileBrand />

        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 font-heading">
            Quem está acessando?
          </h2>
          <p className="mt-2 text-sm text-slate-500">Selecione seu perfil para continuar.</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {profiles.map((profile) => (
            <div key={profile.username} className="relative group">
              <button
                onClick={() => handleProfileSelect(profile.username)}
                className="w-full flex flex-col items-center gap-2.5 p-3 rounded-2xl hover:bg-slate-50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <div
                  className={`h-16 w-16 rounded-2xl bg-gradient-to-br ${getAvatarGradient(profile.username)} flex items-center justify-center text-white text-xl font-bold shadow-md group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-primary/20 transition-all`}
                >
                  {getInitials(profile.username)}
                </div>
                <p className="text-xs font-medium text-slate-700 truncate w-full text-center leading-tight">
                  {profile.username}
                </p>
              </button>
            </div>
          ))}

          <button
            onClick={() => setMode('full-form')}
            className="group flex flex-col items-center gap-2.5 p-3 rounded-2xl hover:bg-slate-50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <div className="h-16 w-16 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 group-hover:border-primary/40 group-hover:text-primary/60 group-hover:scale-105 transition-all">
              <Plus className="h-6 w-6" />
            </div>
            <p className="text-xs text-slate-500">Outra conta</p>
          </button>
        </div>
      </div>
    )
  }

  /* ── Mode: password for selected profile ────────────────────────── */
  if (mode === 'profile-password' && selected) {
    return (
      <div className="w-full max-w-xs">
        <MobileBrand />

        <button
          onClick={() => setMode('profiles')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-8 -ml-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Trocar perfil
        </button>

        <div className="flex flex-col items-center mb-8">
          <div
            className={`h-20 w-20 rounded-3xl bg-gradient-to-br ${getAvatarGradient(selected)} flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-primary/20`}
          >
            {getInitials(selected)}
          </div>
          <p className="mt-3 text-xl font-bold text-slate-900">{selected}</p>
          <p className="text-sm text-slate-500 mt-0.5">Digite sua senha para entrar</p>
        </div>

        <form onSubmit={handleProfileLogin} className="space-y-4">
          <div className="relative">
            <Input
              ref={passwordRef}
              type={showPassword ? 'text' : 'password'}
              value={profilePwd}
              onChange={(e) => setProfilePwd(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="h-11 border-slate-200 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary pr-10"
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {serverError && (
            <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${isOfflineError ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {isOfflineError
                ? <WifiOff className="h-4 w-4 mt-0.5 shrink-0" />
                : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span>{serverError}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-11 font-semibold shadow-sm shadow-primary/20 transition-all"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
            }}
            disabled={!profilePwd || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </Button>
        </form>

        <p className="mt-5 text-center">
          <Link href="/esqueceu-senha" className="text-xs text-primary hover:text-primary/80">
            Esqueceu a senha?
          </Link>
        </p>
      </div>
    )
  }

  /* ── Mode: full form ─────────────────────────────────────────────── */
  return (
    <div className="w-full max-w-sm">
      <MobileBrand />

      {profiles.length > 0 && (
        <button
          onClick={() => setMode('profiles')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-8 -ml-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar aos perfis
        </button>
      )}

      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 font-heading">
          Bem-vindo ao{' '}
          <span className="text-primary">CaixaDoBairro</span>
        </h2>
        <p className="mt-2 text-slate-500 text-sm leading-relaxed">
          Faça login para continuar.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="username" className="text-slate-700 text-sm font-medium">
            Usuário
          </Label>
          <Input
            id="username"
            type="text"
            placeholder="joana ou admin@loja.com"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="h-11 border-slate-200 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary"
            {...register('username')}
          />
          {errors.username && (
            <p className="text-red-600 text-xs flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" />
              {errors.username.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-slate-700 text-sm font-medium">
              Senha
            </Label>
            <Link href="/esqueceu-senha" className="text-xs text-primary hover:text-primary/80 font-medium">
              Esqueceu?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              className="h-11 border-slate-200 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary pr-10"
              {...register('password')}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-red-600 text-xs flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" />
              {errors.password.message}
            </p>
          )}
        </div>

        {serverError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <Button
          type="submit"
          className="w-full h-11 font-semibold shadow-sm shadow-primary/20 transition-all"
          style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
          }}
          disabled={isFormSubmitting}
        >
          {isFormSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Entrando...
            </>
          ) : (
            'Entrar'
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400">
        Protegido por autenticação Supabase
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  )
}
