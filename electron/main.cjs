/**
 * CaixaDoBairro — Electron desktop shell (Windows).
 *
 * Architecture: spawns a local Next.js server so all page rendering and
 * data queries happen entirely on this machine. SQLite is used as the local
 * database when ELECTRON_APP=true, making the app fully offline-capable after
 * the first online sync.
 *
 * First launch requires internet (to log in and sync data from Supabase).
 * After that the app works without any network connection.
 */

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs/promises')
const fss = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const http = require('node:http')
const { setupAutoUpdater } = require('./auto-update.cjs')

const NEXT_PORT = 3099
const APP_URL = `http://127.0.0.1:${NEXT_PORT}`
const APP_ORIGIN = APP_URL

// A single instance only — a POS terminal shouldn't open the app twice.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

/** @type {BrowserWindow | null} */
let mainWindow = null
/** @type {import('node:child_process').ChildProcess | null} */
let nextProcess = null

// ─────────────────────────────────────────────
//  Next.js server management
// ─────────────────────────────────────────────

/**
 * Generates a random HMAC signing secret on first launch and persists it in
 * userData so it survives app updates. Passed to the server process as
 * OFFLINE_SESSION_SECRET so offline session cookies can be signed/verified.
 */
function getOrCreateOfflineSecret(userData) {
  const secretFile = path.join(userData, '.caixadobairro-secret')
  try {
    const existing = fss.readFileSync(secretFile, 'utf8').trim()
    if (existing.length >= 32) return existing
  } catch {}
  const secret = randomBytes(32).toString('hex')
  try { fss.writeFileSync(secretFile, secret, { encoding: 'utf8', mode: 0o600 }) } catch {}
  return secret
}

function getProjectRoot() {
  // app.isPackaged is true when running from an installed .exe
  // electron-builder puts app files inside resources/app.asar
  return app.isPackaged ? app.getAppPath() : path.join(__dirname, '..')
}

/**
 * Next standalone lives in extraResources (`resources/standalone`) so Node can
 * resolve `next` and native addons. Running from inside asar breaks require().
 */
function getStandaloneDir() {
  if (!app.isPackaged) {
    return path.join(__dirname, '..', '.next', 'standalone')
  }
  const candidates = [
    path.join(process.resourcesPath, 'standalone'),
    path.join(process.resourcesPath, 'app.asar.unpacked', '.next', 'standalone'),
    path.join(process.resourcesPath, 'app', '.next', 'standalone'),
  ]
  for (const dir of candidates) {
    if (fss.existsSync(path.join(dir, 'server.js'))) return dir
  }
  return candidates[0]
}

function getStandaloneServer() {
  return path.join(getStandaloneDir(), 'server.js')
}

/** Poll until the local server responds with a non-5xx status. */
function waitForServer(maxMs = 90_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs
    function check() {
      const req = http.get(APP_URL, (res) => {
        res.resume()
        if (res.statusCode < 500) return resolve(undefined)
        if (Date.now() < deadline) return setTimeout(check, 800)
        reject(new Error('Server did not respond in time'))
      })
      req.on('error', () => {
        if (Date.now() < deadline) setTimeout(check, 800)
        else reject(new Error('Server did not start — connection refused after timeout'))
      })
      req.setTimeout(1500, () => req.destroy())
    }
    setTimeout(check, 600) // give the process a moment before first check
  })
}

async function startNextServer() {
  const root = getProjectRoot()
  const dbPath = path.join(app.getPath('userData'), 'caixadobairro.db')
  const logPath = path.join(app.getPath('userData'), 'server.log')
  const standaloneDir = getStandaloneDir()
  const standaloneServer = getStandaloneServer()

  if (app.isPackaged && !fss.existsSync(standaloneServer)) {
    throw new Error(
      `server.js não encontrado.\nProcurado em:\n${standaloneServer}\n\nReinstale o app (build com asarUnpack).`,
    )
  }

  // Packaged: run standalone server.js with Electron as Node (no Node.js
  // install required on the cashier PC). Dev: normal `next dev`.
  const [cmd, cmdArgs, cwd, extraEnv] = app.isPackaged
    ? [
        process.execPath,
        [standaloneServer],
        standaloneDir,
        { ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production' },
      ]
    : [
        'node',
        [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--port', String(NEXT_PORT), '--turbopack'],
        root,
        {},
      ]

  nextProcess = spawn(cmd, cmdArgs, {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
      ELECTRON_APP: 'true',
      DB_PATH: dbPath,
      OFFLINE_CREDS_PATH: app.getPath('userData'),
      PORT: String(NEXT_PORT),
      HOSTNAME: '127.0.0.1',
      OFFLINE_SESSION_SECRET: getOrCreateOfflineSecret(app.getPath('userData')),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // Capture output to a log file so errors are visible even without a terminal.
  const logChunks = []
  nextProcess.stdout.on('data', (d) => logChunks.push(d))
  nextProcess.stderr.on('data', (d) => logChunks.push(d))

  nextProcess.on('error', (err) => {
    logChunks.push(Buffer.from(`spawn error: ${err.message}\n`))
  })

  // If the server exits before waitForServer resolves, reject immediately
  // instead of waiting 90 seconds to time out.
  const earlyExit = new Promise((_, reject) => {
    nextProcess.on('exit', async (code) => {
      const log = Buffer.concat(logChunks).toString('utf8').slice(-2000)
      try { await fs.writeFile(logPath, log) } catch {}
      if (code !== 0 && code !== null) {
        reject(new Error(`Servidor encerrou com código ${code}.\n\nLog (${logPath}):\n${log.slice(-800)}`))
      }
      nextProcess = null
    })
  })

  await Promise.race([waitForServer(), earlyExit])

  // Write log on success too (helps debugging)
  nextProcess?.stdout?.removeAllListeners()
  nextProcess?.stderr?.removeAllListeners()
}

// ─────────────────────────────────────────────
//  Window
// ─────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: 'CaixaDoBairro',
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  mainWindow.loadURL(APP_URL)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_ORIGIN)) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // Trigger initial data sync once the page is loaded and the user is authenticated.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.executeJavaScript(`
      fetch('/api/sync', { method: 'POST' }).catch(() => {})
    `).catch(() => {})
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─────────────────────────────────────────────
//  App lifecycle
// ─────────────────────────────────────────────

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(async () => {
  try {
    await startNextServer()
    createWindow()
    setupAutoUpdater(() => mainWindow)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const logPath = path.join(app.getPath('userData'), 'server.log')
    dialog.showErrorBox(
      'Falha ao iniciar CaixaDoBairro',
      `Não foi possível iniciar o servidor local.\n\n${msg}\n\nLog: ${logPath}`,
    )
    app.quit()
  }
})

app.on('before-quit', () => {
  if (nextProcess) {
    nextProcess.kill()
    nextProcess = null
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─────────────────────────────────────────────
//  Native print + PDF bridge
// ─────────────────────────────────────────────

ipcMain.handle('desktop:print', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { ok: false, reason: 'error', error: 'no-window' }
  return await new Promise((resolve) => {
    win.webContents.print({ silent: false, printBackground: true }, (success, failure) => {
      if (success) resolve({ ok: true })
      else resolve({ ok: false, reason: failure === 'cancelled' ? 'canceled' : 'error', error: failure })
    })
  })
})

ipcMain.handle('desktop:save-pdf', async (event, opts) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { ok: false, reason: 'error', error: 'no-window' }

  const suggested = (opts && opts.suggestedName) || 'fechamento.pdf'
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Salvar PDF',
    defaultPath: suggested,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (canceled || !filePath) return { ok: false, reason: 'canceled' }

  try {
    const buffer = await win.webContents.printToPDF({ printBackground: true })
    await fs.writeFile(filePath, buffer)
    return { ok: true, path: filePath }
  } catch (err) {
    return { ok: false, reason: 'error', error: err instanceof Error ? err.message : String(err) }
  }
})
