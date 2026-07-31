'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ShoppingCart,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

const schema = z
  .object({
    password: z.string().min(6, 'Mínimo 6 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

interface ResetPasswordFormProps {
  code: string | undefined
}

export function ResetPasswordForm({ code }: ResetPasswordFormProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid' | 'success'>('loading')
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!code) {
      setStatus('invalid')
      return
    }
    const supabase = createClient()
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      setStatus(error ? 'invalid' : 'ready')
    })
  }, [code])

  async function onSubmit(data: FormData) {
    setServerError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: data.password })
    if (error) {
      setServerError('Não foi possível atualizar a senha. Solicite um novo link.')
      return
    }
    setStatus('success')
    setTimeout(() => router.push('/login'), 2500)
  }

  return (
    <div className="w-full max-w-sm">
      {/* Mobile brand */}
      <div className="flex lg:hidden items-center gap-2 mb-10">
        <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
          <ShoppingCart className="h-4 w-4 text-white" />
        </div>
        <span className="font-semibold text-slate-900">CaixaDoBairro</span>
      </div>

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Verificando link...</p>
        </div>
      )}

      {status === 'invalid' && (
        <div className="text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Link inválido</h2>
            <p className="mt-2 text-slate-500 text-sm">
              Este link expirou ou já foi utilizado. Solicite um novo.
            </p>
          </div>
          <Link
            href="/esqueceu-senha"
            className="inline-block text-sm font-medium text-primary hover:text-primary/80"
          >
            Solicitar novo link
          </Link>
        </div>
      )}

      {status === 'success' && (
        <div className="text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 className="h-7 w-7 text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Senha atualizada!</h2>
            <p className="mt-2 text-slate-500 text-sm">Redirecionando para o login...</p>
          </div>
        </div>
      )}

      {status === 'ready' && (
        <>
          <div className="mb-8">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
              Nova senha
            </h2>
            <p className="mt-2 text-slate-500">Escolha uma nova senha para sua conta.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 text-sm font-medium">
                Nova senha
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  className="h-11 border-slate-200 focus-visible:ring-2 focus-visible:ring-blue-600/20 focus-visible:border-primary pr-10"
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

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-700 text-sm font-medium">
                Confirmar senha
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  className="h-11 border-slate-200 focus-visible:ring-2 focus-visible:ring-blue-600/20 focus-visible:border-primary pr-10"
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showConfirm ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-red-600 text-xs flex items-center gap-1.5">
                  <AlertCircle className="h-3 w-3" />
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            {serverError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-medium shadow-sm transition-colors"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar nova senha'
              )}
            </Button>
          </form>
        </>
      )}
    </div>
  )
}
