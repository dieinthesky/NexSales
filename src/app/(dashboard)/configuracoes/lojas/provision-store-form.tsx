'use client'

import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Loader2, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { provisionStore } from './actions'

interface FormValues {
  storeName: string
  ownerFirstName: string
  ownerLastName: string
  ownerUsername: string
  ownerPassword: string
  copyCatalog: boolean
}

export function ProvisionStoreForm() {
  const [pending, startTransition] = useTransition()
  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: { copyCatalog: true },
  })

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await provisionStore(values)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Loja criada. Dono já pode entrar com o usuário informado.')
      reset({ copyCatalog: true })
    })
  }

  return (
    <Card className="space-y-4 border-slate-200/80 p-4 dark:border-white/8">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <Store className="h-4 w-4" />
        Nova loja + dono
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="storeName">Nome da loja</Label>
          <Input id="storeName" placeholder="Mercadinho do João" {...register('storeName', { required: true })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ownerFirstName">Nome do dono</Label>
          <Input id="ownerFirstName" {...register('ownerFirstName', { required: true })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ownerLastName">Sobrenome</Label>
          <Input id="ownerLastName" {...register('ownerLastName', { required: true })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ownerUsername">Usuário de login</Label>
          <Input id="ownerUsername" placeholder="joao" {...register('ownerUsername', { required: true })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ownerPassword">Senha inicial</Label>
          <Input
            id="ownerPassword"
            type="password"
            autoComplete="new-password"
            {...register('ownerPassword', { required: true, minLength: 6 })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 sm:col-span-2">
          <input type="checkbox" className="rounded border-slate-300" defaultChecked {...register('copyCatalog')} />
          Copiar catálogo modelo (produtos com estoque zerado; sem vendas)
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Criar loja
          </Button>
        </div>
      </form>
    </Card>
  )
}
