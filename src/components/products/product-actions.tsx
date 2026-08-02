'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Trash2, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { deleteProduct } from '@/app/(dashboard)/produtos/actions'

interface ProductActionsProps {
  productId: string
  productName: string
}

export function ProductActions({ productId, productName }: ProductActionsProps) {
  const router = useRouter()
  const [showDelete, setShowDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    if (isDeleting) return
    setIsDeleting(true)
    try {
      const result = await deleteProduct(productId)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      if (result && 'message' in result && result.message) {
        toast.success(result.message)
      } else if (result && 'deleted' in result && result.deleted) {
        toast.success('Produto excluído')
      } else {
        toast.success('Produto desativado')
      }
      setShowDelete(false)
      router.refresh()
    } catch {
      toast.error('Falha ao excluir. Tente de novo.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/produtos/${productId}`}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/produtos/${productId}/etiqueta`}>
              <Tag className="mr-2 h-4 w-4" />
              Etiqueta de prateleira
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-600 focus:text-red-600"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              O produto <strong>{productName}</strong> será removido. Se já tiver sido
              vendido, ele só será desativado para preservar o histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => void handleDelete(e)}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
