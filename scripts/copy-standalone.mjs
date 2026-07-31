import { cp } from 'node:fs/promises'

await cp('.next/static', '.next/standalone/.next/static', { recursive: true })
await cp('public', '.next/standalone/public', { recursive: true })

// better-sqlite3 must match the Electron ABI (packaged app runs server.js via
// ELECTRON_RUN_AS_NODE). Run `electron-rebuild` before this script so the
// .node file copied here is the Electron build, not system Node.
await cp(
  'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  '.next/standalone/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  { force: true },
)

console.log('standalone assets copied')
