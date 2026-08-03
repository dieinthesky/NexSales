import { describe, expect, it } from 'vitest'
import { buildPixPayload, isPixConfigured } from '@/lib/utils/pix-brcode'

describe('pix-brcode', () => {
  it('detects empty key', () => {
    expect(isPixConfigured('')).toBe(false)
    expect(isPixConfigured('  ')).toBe(false)
    expect(isPixConfigured('loja@email.com')).toBe(true)
  })

  it('builds payload with CRC and PIX GUI', () => {
    const payload = buildPixPayload({
      key: 'teste@example.com',
      merchantName: 'Mercadinho Walter',
      merchantCity: 'Sobral',
      amount: 12.5,
      txid: 'ORDER1',
    })
    expect(payload).toBeTruthy()
    expect(payload!).toContain('BR.GOV.BCB.PIX')
    expect(payload!).toContain('teste@example.com')
    expect(payload!).toContain('12.50')
    expect(payload!.endsWith(payload!.slice(-4))).toBe(true)
    // CRC field id 63 with length 04
    expect(payload!.slice(-8, -4)).toBe('6304')
    expect(payload!.length).toBeGreaterThan(50)
  })

  it('returns null without key', () => {
    expect(buildPixPayload({ key: '', merchantName: 'X' })).toBeNull()
  })
})
