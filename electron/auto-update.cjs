/**
 * Auto-update via GitHub Releases (electron-updater + NSIS).
 * Só roda no app instalado (packaged). Em dev não faz nada.
 */

const { dialog, app } = require('electron')

/** @param {import('electron').BrowserWindow | null} getMainWindow */
function setupAutoUpdater(getMainWindow) {
  if (!app.isPackaged) return

  let autoUpdater
  try {
    ;({ autoUpdater } = require('electron-updater'))
  } catch (err) {
    console.error('[auto-update] electron-updater não encontrado:', err)
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // App não assinado (Hobby) — ainda atualiza; o Windows pode avisar no instalador.
  autoUpdater.allowDowngrade = false

  autoUpdater.on('error', (err) => {
    console.error('[auto-update]', err == null ? err : err.message || err)
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[auto-update] disponível:', info.version)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    const win = typeof getMainWindow === 'function' ? getMainWindow() : null
    const result = await dialog.showMessageBox(win ?? undefined, {
      type: 'info',
      buttons: ['Reiniciar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      title: 'Atualização CaixaDoBairro',
      message: 'Nova versão pronta para instalar',
      detail: `Versão ${info.version} já foi baixada.\nReinicie o app para concluir a atualização.`,
    })
    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true)
    }
  })

  // Atraso curto: não atrasa a abertura do PDV
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[auto-update] check failed:', err == null ? err : err.message || err)
    })
  }, 8_000)
}

module.exports = { setupAutoUpdater }
