'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isInternalEmail } from '@/lib/supabase/service'
import { getCurrentUser, isAdmin } from '@/lib/auth/roles'
import { reportRecipientSchema } from '@/lib/validations/report-recipient.schema'
import { getCashClose, todayLocalISO } from '@/lib/queries/cash-close'
import { buildCashCloseEmail } from '@/lib/email/cash-close-email'
import { getReportRecipients } from '@/lib/email/report-recipients'
import { sendMail, isSmtpConfigured } from '@/lib/email/mailer'

export interface ActionResult {
  success?: boolean
  error?: string
}

export interface SendReportResult extends ActionResult {
  /** How many addresses received the email (for the success toast). */
  sentTo?: number
  /** How many sales were included in the report. */
  sales?: number
}

const PATH = '/configuracoes/relatorio'

export async function addReportRecipient(formData: {
  email: string
}): Promise<ActionResult> {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem gerenciar destinatários.' }
  }

  const parsed = reportRecipientSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { email } = parsed.data
  if (isInternalEmail(email)) {
    return { error: 'Use um email real — usuários internos não recebem email.' }
  }

  const user = await getCurrentUser()
  if (!user?.storeId) {
    return { error: 'Sua conta não está vinculada a uma loja.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('report_recipients')
    .insert({ email, store_id: user.storeId })

  if (error) {
    if (error.code === '23505' || error.message.toLowerCase().includes('unique')) {
      return { error: 'Esse email já está na lista.' }
    }
    return { error: error.message }
  }

  revalidatePath(PATH)
  return { success: true }
}

export async function setReportRecipientActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem gerenciar destinatários.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('report_recipients')
    .update({ active })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath(PATH)
  return { success: true }
}

export async function deleteReportRecipient(id: string): Promise<ActionResult> {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem gerenciar destinatários.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('report_recipients').delete().eq('id', id)

  if (error) return { error: error.message }

  revalidatePath(PATH)
  return { success: true }
}

/**
 * Sends the report of everything sold so far today, on demand. Mirrors the
 * daily cron's pipeline (same summary, same recipient resolution, same email)
 * but flagged `partial` since it runs mid-day. Admin-only.
 */
export async function sendReportNow(): Promise<SendReportResult> {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem enviar o relatório.' }
  }

  if (!isSmtpConfigured()) {
    return { error: 'Email não configurado no servidor (SMTP). Contate o suporte.' }
  }

  try {
    const day = todayLocalISO()
    // Admin session reads sales under RLS — same path as the cash-close page.
    const summary = await getCashClose(day)
    const recipients = await getReportRecipients()

    if (recipients.length === 0) {
      return {
        error:
          'Nenhum destinatário com email real. Adicione um email à lista ou defina REPORT_EMAIL.',
      }
    }

    const email = buildCashCloseEmail(summary, 'VendasApp', { partial: true })
    await sendMail({
      to: recipients,
      subject: email.subject,
      html: email.html,
      text: email.text,
    })

    return { success: true, sentTo: recipients.length, sales: summary.count }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao enviar o relatório.'
    return { error: message }
  }
}
