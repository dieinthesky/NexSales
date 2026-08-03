/**
 * Payload PIX estático/dinâmico (copia-e-cola EMV) sem dependências.
 * Gera string para QR Code + botão copiar.
 */

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0')
  return `${id}${len}${value}`
}

function crc16(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function sanitizeMerchant(text: string, max: number): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, max)
}

export type PixBuildInput = {
  /** Chave PIX: e-mail, telefone, CPF/CNPJ ou EVP */
  key: string
  merchantName: string
  merchantCity?: string
  /** Valor opcional — se omitido, o cliente digita no app do banco */
  amount?: number
  txid?: string
}

export function buildPixPayload(input: PixBuildInput): string | null {
  const key = input.key.trim()
  if (!key) return null

  const name = sanitizeMerchant(input.merchantName || 'CAIXA DO BAIRRO', 25) || 'CAIXA DO BAIRRO'
  const city = sanitizeMerchant(input.merchantCity || 'SAO PAULO', 15) || 'SAO PAULO'
  const txid = (input.txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'

  const merchantAccount = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', key)

  let payload =
    tlv('00', '01') +
    tlv('26', merchantAccount) +
    tlv('52', '0000') +
    tlv('53', '986')

  if (input.amount != null && Number.isFinite(input.amount) && input.amount > 0) {
    payload += tlv('54', input.amount.toFixed(2))
  }

  payload +=
    tlv('58', 'BR') +
    tlv('59', name) +
    tlv('60', city) +
    tlv('62', tlv('05', txid)) +
    '6304'

  return payload + crc16(payload)
}

export function isPixConfigured(key: string | null | undefined): boolean {
  return Boolean(key && key.trim().length >= 3)
}
