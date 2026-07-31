'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ShoppingCart, Loader2, AlertCircle, ArrowLeft, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { forgotPassword } from '../login/actions'

const schema = z.object({
  email: z.string().email('Email inválido'),
})
type FormData = z.infer<typeof schema>

export default function EsqueceuSenhaPage() {
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setServerError(null)
    const result = await forgotPassword(data.email)
    if (result?.error) {
      setServerError(result.error)
    } else {
      setSent(true)
    }
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

      {sent ? (
        <div className="text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-green-50 flex items-center justify-center">
            <Mail className="h-7 w-7 text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Email enviado!</h2>
            <p className="mt-2 text-slate-500 text-sm">
              Verifique sua caixa de entrada e clique no link para redefinir a senha.
            </p>
            <p className="mt-1 text-slate-400 text-xs">
              Não recebeu? Verifique a pasta de spam.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-block text-sm font-medium text-primary hover:text-primary/80"
          >
            ← Voltar para o login
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
              Esqueceu a senha?
            </h2>
            <p className="mt-2 text-slate-500">
              Informe seu email e enviaremos um link para redefinir a senha.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700 text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                autoComplete="email"
                className="h-11 border-slate-200 focus-visible:ring-2 focus-visible:ring-blue-600/20 focus-visible:border-primary"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-red-600 text-xs flex items-center gap-1.5">
                  <AlertCircle className="h-3 w-3" />
                  {errors.email.message}
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
                  Enviando...
                </>
              ) : (
                'Enviar link de redefinição'
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            <Link
              href="/login"
              className="font-medium text-primary hover:text-primary/80 inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar para o login
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
