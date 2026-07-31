import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'

await cp('.next/static', '.next/standalone/.next/static', { recursive: true })
await cp('public', '.next/standalone/public', { recursive: true })

/** Copy a package into standalone/node_modules (needed for serverExternalPackages). */
async function copyPkg(name) {
  const from = path.join('node_modules', name)
  const to = path.join('.next', 'standalone', 'node_modules', name)
  await mkdir(path.dirname(to), { recursive: true })
  await cp(from, to, { recursive: true, force: true })
}

// better-sqlite3 is serverExternalPackages — Next may omit it from standalone.
await copyPkg('better-sqlite3')
await copyPkg('bindings')
await copyPkg('file-uri-to-path')

// Ensure the Electron-ABI .node (from electron-rebuild) is what gets shipped.
await cp(
  'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  '.next/standalone/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  { force: true },
)

console.log('standalone assets copied (incl. better-sqlite3)')
