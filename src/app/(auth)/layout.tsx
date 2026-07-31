function DashboardMockup() {
  const chartPoints = [50, 38, 44, 22, 32, 12, 25, 8, 18, 4, 14, 8]
  const maxH = 50
  const w = 200
  const pts = chartPoints.map((v, i) => `${(i / (chartPoints.length - 1)) * w},${v}`).join(' ')
  const area = `${pts} ${w},${maxH} 0,${maxH}`

  return (
    <div
      className="w-full rounded-2xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
      style={{
        transform: 'perspective(1600px) rotateY(-8deg) rotateX(4deg)',
        transformOrigin: 'center center',
      }}
    >
      {/* Browser chrome */}
      <div className="bg-[#0f0e1a] px-3 py-2.5 flex items-center gap-2 border-b border-white/[0.06]">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
          <div className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
        </div>
        <div className="flex-1 mx-2">
          <div className="bg-white/5 rounded-md px-3 py-1 text-[9px] text-white/25 text-center tracking-wide">
            caixadobairro.app/dashboard
          </div>
        </div>
      </div>

      {/* Dashboard body */}
      <div className="flex bg-[#0d0c1f]" style={{ minHeight: '240px' }}>
        {/* Sidebar */}
        <div className="w-12 bg-[#09081a] flex flex-col items-center pt-3 gap-2.5 border-r border-white/[0.05] shrink-0">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center text-white text-[9px] font-black">
            C
          </div>
          <div className="mt-1 flex flex-col gap-2 items-center w-full px-2">
            {[true, false, false, false, false].map((active, i) => (
              <div
                key={i}
                className={`h-5 w-full rounded-md ${active ? 'bg-primary/25' : 'bg-white/5'}`}
              />
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 p-3 space-y-2.5 min-w-0">
          {/* Page header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="h-2.5 w-20 bg-white/80 rounded-full" />
              <div className="h-1.5 w-14 bg-white/25 rounded-full mt-1" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-4 w-4 rounded-full bg-primary/50" />
              <div className="h-4 w-10 bg-white/10 rounded-md" />
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
              <div className="h-1.5 w-14 bg-white/30 rounded-full" />
              <div className="h-3.5 w-24 bg-white/85 rounded-full mt-1.5" />
              <div className="flex items-center gap-1 mt-1.5">
                <div className="h-1 w-1 rounded-full bg-emerald-400" />
                <div className="h-1 w-10 bg-emerald-400/50 rounded-full" />
              </div>
            </div>
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-2">
              <div className="h-1.5 w-10 bg-white/30 rounded-full" />
              <div className="h-3.5 w-10 bg-white/85 rounded-full mt-1.5" />
              <div className="flex items-center gap-1 mt-1.5">
                <div className="h-1 w-1 rounded-full bg-violet-400" />
                <div className="h-1 w-8 bg-violet-400/50 rounded-full" />
              </div>
            </div>
          </div>

          {/* Line chart */}
          <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2">
            <div className="h-1.5 w-28 bg-white/30 rounded-full mb-2" />
            <svg viewBox={`0 0 ${w} ${maxH}`} className="w-full" style={{ height: '52px' }} preserveAspectRatio="none">
              <defs>
                <linearGradient id="mcg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={area} fill="url(#mcg)" />
              <polyline
                points={pts}
                fill="none"
                stroke="#a78bfa"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Bottom row: table + donut */}
          <div className="grid grid-cols-2 gap-2">
            {/* Products list */}
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2 space-y-1.5">
              <div className="h-1.5 w-20 bg-white/30 rounded-full" />
              {[80, 65, 50].map((w2, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-sm bg-white/10 shrink-0" />
                  <div className="h-1 rounded-full bg-white/15" style={{ flex: 1 }} />
                  <div className="h-1 rounded-full bg-white/25 shrink-0" style={{ width: `${w2 * 0.3}px` }} />
                </div>
              ))}
            </div>

            {/* Donut chart */}
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2 flex flex-col items-center justify-center gap-1">
              <div className="h-1.5 w-16 bg-white/30 rounded-full" />
              <svg viewBox="0 0 40 40" className="w-10 h-10 -rotate-90">
                <circle cx="20" cy="20" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
                <circle cx="20" cy="20" r="14" fill="none" stroke="#7c3aed" strokeWidth="7" strokeDasharray="44 88" />
                <circle cx="20" cy="20" r="14" fill="none" stroke="#10b981" strokeWidth="7" strokeDasharray="22 88" strokeDashoffset="-44" />
                <circle cx="20" cy="20" r="14" fill="none" stroke="#0891b2" strokeWidth="7" strokeDasharray="14 88" strokeDashoffset="-66" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left: branding + mockup panel */}
      <aside
        className="relative hidden lg:flex lg:w-[58%] flex-col p-10 xl:p-12 text-white overflow-hidden"
        style={{
          backgroundImage:
            'radial-gradient(140% 90% at 5% 5%, #4c1d95 0%, #1e1b4b 38%, #080714 100%)',
        }}
      >
        {/* Grid overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Ambient glow blobs */}
        <div aria-hidden className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        <div aria-hidden className="absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-purple-900/40 blur-3xl" />
        <div aria-hidden className="absolute top-1/3 right-0 h-80 w-80 rounded-full bg-indigo-800/20 blur-3xl" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/40 ring-1 ring-white/15">
            <span className="text-white font-extrabold text-base tracking-tight select-none">C</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-lg font-bold tracking-tight">CaixaDoBairro</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-purple-300/60">
              PDV do seu mercado
            </span>
          </div>
        </div>

        {/* Hero section: text left + mockup right */}
        <div className="relative z-10 flex-1 flex items-center gap-8 mt-10">
          {/* Left: text */}
          <div className="flex-1 min-w-0 space-y-6 max-w-[230px] xl:max-w-[260px]">
            <div className="space-y-3">
              <h1 className="text-3xl xl:text-[2.2rem] font-bold tracking-tight leading-[1.1]">
                O caixa do{' '}
                <span
                  style={{
                    backgroundImage: 'linear-gradient(135deg, #c4b5fd 0%, #a78bfa 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  seu bairro.
                </span>
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                Vendas, estoque e fiado no mesmo lugar — simples de usar no balcão.
              </p>
            </div>

            <ul className="space-y-3.5">
              {[
                { icon: '📊', title: 'Vendas do dia', desc: 'Acompanhe o movimento do caixa na hora.' },
                { icon: '📦', title: 'Controle de estoque', desc: 'Produtos, preços e alertas de estoque baixo.' },
                { icon: '👥', title: 'Clientes e fiado', desc: 'Cadastro, vale e histórico em um só lugar.' },
              ].map((item) => (
                <li key={item.title} className="flex items-start gap-3">
                  <div className="mt-0.5 h-7 w-7 rounded-lg bg-white/8 border border-white/10 flex items-center justify-center text-sm shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white/90">{item.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2 pt-2">
              <div className="h-4 w-4 rounded-full bg-emerald-400/20 flex items-center justify-center shrink-0">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
              </div>
              <p className="text-[11px] text-slate-500">
                Seus dados{' '}
                <span className="text-violet-400 font-medium">sempre protegidos</span>
              </p>
            </div>
          </div>

          {/* Right: dashboard mockup */}
          <div className="flex-1 min-w-0">
            <DashboardMockup />
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 mt-8 text-[11px] text-slate-600">
          &copy; {new Date().getFullYear()} CaixaDoBairro &middot; Todos os direitos reservados
        </div>
      </aside>

      {/* Right: form area — always light regardless of OS dark mode */}
      <section className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-white text-slate-900 dark:bg-white dark:text-slate-900 [color-scheme:light]">
        {children}
      </section>
    </div>
  )
}
