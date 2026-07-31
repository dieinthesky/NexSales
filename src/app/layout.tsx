import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Poppins } from 'next/font/google'
import { cookies } from 'next/headers'
import { Toaster } from 'sonner'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register'
import './globals.css'

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
})

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
})

const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  display: 'swap',
  weight: ['600', '700', '800'],
})

export const metadata: Metadata = {
  metadataBase: new URL('https://nex-sales.vercel.app'),
  title: 'CaixaDoBairro — PDV do bairro',
  description: 'PDV, estoque, fiado e relatórios para o mercadinho do seu bairro.',
  applicationName: 'CaixaDoBairro',
  keywords: ['PDV', 'ponto de venda', 'gestão de vendas', 'clientes', 'relatórios', 'CaixaDoBairro'],
  authors: [{ name: 'CaixaDoBairro' }],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    title: 'CaixaDoBairro — PDV do bairro',
    description: 'PDV, estoque, fiado e relatórios para o mercadinho do seu bairro.',
    siteName: 'CaixaDoBairro',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CaixaDoBairro — PDV do bairro',
    description: 'PDV, estoque, fiado e relatórios para o mercadinho do seu bairro.',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CaixaDoBairro',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const theme = cookieStore.get('theme')?.value
  const isDark = theme === 'dark'

  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${inter.variable} ${jetBrainsMono.variable} ${poppins.variable} h-full antialiased${isDark ? ' dark' : ''}`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster richColors position="top-right" />
        <ServiceWorkerRegister />
        <SpeedInsights />
      </body>
    </html>
  )
}
