'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { deleteCustomer, updateCustomer } from './actions'

interface CustomerActionsProps {
  customerId: string
  fullName: string
  phone: string | null
  notes: string | null
  currentDebt: number
}

export function CustomerActions({
  customerId,
  fullName,
  phone,
  notes,
  currentDebt,
}: CustomerActionsProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState(fullName)
  const [phoneValue, setPhoneValue] = useState(phone ?? '')
  const [notesValue, setNotesValue] = useState(notes ?? '')
  const [pending, startTransition] = useTransition()

  function saveEdit() {
    startTransition(async () => {
      const result = await updateCustomer({
        customerId,
        fullName: name,
        phone: phoneValue,
        notes: notesValue,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Cliente atualizado')
      setEditOpen(false)
      router.refresh()
    })
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteCustomer(customerId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Cliente excluído')
      setDeleteOpen(false)
      router.push('/clientes')
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setName(fullName)
            setPhoneValue(phone ?? '')
            setNotesValue(notes ?? '')
            setEditOpen(true)
          }}
        >
          <Pencil className="h-4 w-4 mr-1.5" />
          Editar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          Excluir
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="customer-name">Nome</Label>
              <Input
                id="customer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-phone">Telefone</Label>
              <Input
                id="customer-phone"
                value={phoneValue}
                onChange={(e) => setPhoneValue(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-notes">Observações</Label>
              <Input
                id="customer-notes"
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveEdit} disabled={pending || !name.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              {currentDebt > 0
                ? `Este cliente ainda tem débito de fiado. Quite o valor antes de excluir.`
                : `O cliente ${fullName} será removido. Não é possível excluir se houver vendas ou pagamentos vinculados.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={pending || currentDebt > 0}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
