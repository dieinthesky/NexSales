export interface RecentProfile {
  username: string
  lastLogin: string
}

const KEY = 'caixadobairro_recent_profiles'
const MAX = 2

export function getRecentProfiles(): RecentProfile[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as RecentProfile[]) : []
  } catch {
    return []
  }
}

export function saveProfile(username: string): void {
  const profiles = getRecentProfiles().filter((p) => p.username !== username)
  profiles.unshift({ username, lastLogin: new Date().toISOString() })
  localStorage.setItem(KEY, JSON.stringify(profiles.slice(0, MAX)))
}

export function removeProfile(username: string): void {
  const profiles = getRecentProfiles().filter((p) => p.username !== username)
  localStorage.setItem(KEY, JSON.stringify(profiles))
}

export function getInitials(username: string): string {
  const parts = username.trim().split(/[\s._@-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return username.slice(0, 2).toUpperCase()
}

const GRADIENTS = [
  'from-primary to-primary/70',
  'from-violet-500 to-violet-700',
  'from-emerald-500 to-emerald-700',
  'from-rose-500 to-rose-700',
  'from-amber-500 to-amber-600',
  'from-cyan-500 to-cyan-700',
  'from-indigo-500 to-indigo-700',
  'from-pink-500 to-pink-700',
]

export function getAvatarGradient(username: string): string {
  let hash = 0
  for (const ch of username) hash = ((hash * 31) + ch.charCodeAt(0)) & 0xffff
  return GRADIENTS[hash % GRADIENTS.length]
}
