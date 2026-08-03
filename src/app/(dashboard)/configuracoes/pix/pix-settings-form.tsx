'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { saveStorePixSettings } from './actions'
import type { StorePixForm } from '@/lib/store-pix'

interface PixSettingsFormProps {
  initial: StorePixForm
  storeName: string
}

export function PixSettingsForm({ initial, storeName }: PixSettingsFormProps) {
  const [form, setForm] = useState<StorePixForm>(initial)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = await saveStorePixSettings(form)
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('PIX da loja salvo')
  }

  return (
    <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60 p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
          <QrCode className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Chave PIX · {storeName}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Você mesmo cadastra — e-mail, celular com DDD, CPF/CNPJ ou chave aleatória. Não
            precisa pedir para ninguém rodar SQL no Supabase.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pix_key">Chave PIX</Label>
          <Input
            id="pix_key"
            value={form.pix_key}
            onChange={(e) => setForm((f) => ({ ...f, pix_key: e.target.value }))}
            placeholder="ex: loja@email.com ou 88999999999"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pix_merchant_name">Nome no comprovante</Label>
            <Input
              id="pix_merchant_name"
              value={form.pix_merchant_name}
              onChange={(e) => setForm((f) => ({ ...f, pix_merchant_name: e.target.value }))}
              placeholder="Nome da loja"
              maxLength={40}
              autoComplete="off"
            />
            <p className="text-[11px] text-slate-400">Sem acentos; o PIX limita a 25 caracteres.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pix_merchant_city">Cidade</Label>
            <Input
              id="pix_merchant_city"
              value={form.pix_merchant_city}
              onChange={(e) => setForm((f) => ({ ...f, pix_merchant_city: e.target.value }))}
              placeholder="ex: Sobral"
              maxLength={30}
              autoComplete="off"
            />
          </div>
        </div>
        <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-500">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar PIX'
          )}
        </Button>
      </form>
    </Card>
  )
}
