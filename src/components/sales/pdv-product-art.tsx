'use client'

type ArtKind = 'can' | 'bottle' | 'bag' | 'box' | 'tag'

const KINDS: ArtKind[] = ['can', 'bottle', 'bag', 'box', 'tag']

const SCENES = [
  { sky: '#dbeafe', ground: '#93c5fd', accent: '#1e3a5f', label: '#234e7a' },
  { sky: '#d1fae5', ground: '#6ee7b7', accent: '#065f46', label: '#047857' },
  { sky: '#ffedd5', ground: '#fdba74', accent: '#9a3412', label: '#c2410c' },
  { sky: '#ede9fe', ground: '#c4b5fd', accent: '#5b21b6', label: '#6d28d9' },
  { sky: '#fce7f3', ground: '#f9a8d4', accent: '#9d174d', label: '#be185d' },
] as const

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h
}

function pickKind(name: string): ArtKind {
  const n = name.toLowerCase()
  if (!n || n.includes('avulso')) return 'tag'
  if (/(coca|refri|suco|água|agua|bebida|guaran|cerveja|vinho)/.test(n)) return 'bottle'
  if (/(milho|ervilha|atum|sardinha|conserva|lata)/.test(n)) return 'can'
  if (/(arroz|feijão|feijao|açúcar|acucar|farinha|sal|pacote)/.test(n)) return 'bag'
  if (/(biscoito|bolacha|caixa|kit|cereal)/.test(n)) return 'box'
  return KINDS[hashName(n) % KINDS.length]
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

interface PdvProductArtProps {
  name: string
  className?: string
}

/** Ilustração do produto (ainda sem foto real no cadastro). */
export function PdvProductArt({ name, className = '' }: PdvProductArtProps) {
  const scene = SCENES[hashName(name || 'item') % SCENES.length]
  const kind = pickKind(name)
  const mark = initials(name)

  return (
    <div
      className={`relative overflow-hidden rounded-2xl shadow-sm ring-1 ring-slate-200 ${className}`}
      style={{ background: `linear-gradient(180deg, ${scene.sky} 0%, ${scene.ground} 100%)` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 220" className="h-full w-full" role="img">
        <title>{name}</title>
        {/* soft shelf */}
        <ellipse cx="100" cy="190" rx="70" ry="12" fill="rgba(15,23,42,0.12)" />

        {kind === 'bottle' && (
          <g transform="translate(70,28)">
            <rect x="22" y="0" width="16" height="22" rx="4" fill={scene.accent} />
            <path
              d="M10 28 C10 20 50 20 50 28 L54 150 C54 162 6 162 6 150 Z"
              fill="white"
              stroke={scene.accent}
              strokeWidth="3"
            />
            <rect x="14" y="55" width="32" height="48" rx="6" fill={scene.accent} opacity="0.9" />
            <text
              x="30"
              y="84"
              textAnchor="middle"
              fill="white"
              fontSize="14"
              fontWeight="700"
              fontFamily="system-ui,sans-serif"
            >
              {mark}
            </text>
          </g>
        )}

        {kind === 'can' && (
          <g transform="translate(55,48)">
            <ellipse cx="45" cy="12" rx="40" ry="12" fill={scene.accent} />
            <rect x="5" y="12" width="80" height="110" fill="white" stroke={scene.accent} strokeWidth="3" />
            <ellipse cx="45" cy="122" rx="40" ry="12" fill={scene.accent} opacity="0.85" />
            <rect x="14" y="40" width="62" height="50" rx="8" fill={scene.accent} />
            <text
              x="45"
              y="72"
              textAnchor="middle"
              fill="white"
              fontSize="16"
              fontWeight="700"
              fontFamily="system-ui,sans-serif"
            >
              {mark}
            </text>
          </g>
        )}

        {kind === 'bag' && (
          <g transform="translate(48,40)">
            <path
              d="M20 20 L84 20 L96 140 C96 152 8 152 8 140 Z"
              fill="white"
              stroke={scene.accent}
              strokeWidth="3"
            />
            <path d="M28 20 C28 8 76 8 76 20" fill="none" stroke={scene.accent} strokeWidth="3" />
            <rect x="26" y="55" width="52" height="40" rx="8" fill={scene.accent} />
            <text
              x="52"
              y="81"
              textAnchor="middle"
              fill="white"
              fontSize="15"
              fontWeight="700"
              fontFamily="system-ui,sans-serif"
            >
              {mark}
            </text>
          </g>
        )}

        {kind === 'box' && (
          <g transform="translate(45,50)">
            <path d="M55 0 L110 28 L55 56 L0 28 Z" fill={scene.accent} />
            <path d="M0 28 L55 56 L55 140 L0 112 Z" fill="white" stroke={scene.accent} strokeWidth="2" />
            <path d="M55 56 L110 28 L110 112 L55 140 Z" fill="#f8fafc" stroke={scene.accent} strokeWidth="2" />
            <text
              x="28"
              y="95"
              textAnchor="middle"
              fill={scene.label}
              fontSize="14"
              fontWeight="700"
              fontFamily="system-ui,sans-serif"
            >
              {mark}
            </text>
          </g>
        )}

        {kind === 'tag' && (
          <g transform="translate(50,55)">
            <rect x="10" y="10" width="90" height="100" rx="16" fill="white" stroke={scene.accent} strokeWidth="3" />
            <circle cx="55" cy="40" r="14" fill={scene.accent} />
            <text
              x="55"
              y="90"
              textAnchor="middle"
              fill={scene.label}
              fontSize="18"
              fontWeight="700"
              fontFamily="system-ui,sans-serif"
            >
              {mark}
            </text>
          </g>
        )}
      </svg>
      <p className="absolute inset-x-2 bottom-2 truncate rounded-md bg-white/85 px-2 py-1 text-center text-[11px] font-semibold text-slate-700">
        {name}
      </p>
    </div>
  )
}
