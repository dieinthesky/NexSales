import type { NextConfig } from 'next'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const packageVersion = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf8'),
).version as string

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  // Bake the public Supabase vars into every bundle (server, middleware, edge).
  // Without this, process.env.NEXT_PUBLIC_* is undefined in the standalone server
  // env because the Electron process doesn't inherit .env.local at runtime.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION ?? packageVersion,
  },
  async headers() {
    return [
      {
        // The Service Worker script needs the correct content-type AND
        // must not be cached by the browser, otherwise new SW versions
        // won't propagate to clients between deploys.
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ]
  },
}

export default nextConfig
