'use strict';

/**
 * BBZ Cloud Hub – schlanker Nextcloud-Hub-Desktop-Client.
 *
 * Fokus: Ein einziges, "warm" gehaltenes Fenster auf den Nextcloud Hub.
 * Funktionen: automatischer ADFS/SAML-Login, System-Tray + native
 * Benachrichtigungen (Talk-Badge), Auto-Update über GitHub-Releases.
 *
 * Keine Multi-Service-Navigation – alles (BBB, Talk, Moodle, Files …) lebt
 * im Hub selbst.
 */

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  session,
  shell,
  ipcMain,
  nativeImage,
} = require('electron');
const path = require('path');
const keytar = require('keytar');
const { autoUpdater } = require('electron-updater');

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

const HUB_URL = 'https://cloud.bbz-rd-eck.de';
const HUB_HOST = 'cloud.bbz-rd-eck.de';
// BBB-Meetings (vom Hub gestartet) laufen auf diesem Host – im eigenen Fenster
// halten, damit Kamera/Mikrofon funktionieren.
const MEETING_HOSTS = ['bbb.bbz-rd-eck.de'];

// Geteilt mit der "großen" BBZCloud-App: vorhandene Anmeldedaten greifen sofort.
const KEYTAR_SERVICE = 'bbzcloud';
const PARTITION = 'persist:bbzhub';

// Echte Chrome-UA – Nextcloud/ADFS verweigern teils unbekannte Electron-UAs.
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const ASSET = (file) =>
  app.isPackaged
    ? path.join(process.resourcesPath, 'assets', file)
    : path.join(__dirname, 'assets', file);

// ---------------------------------------------------------------------------
// Modul-State
// ---------------------------------------------------------------------------

let mainWindow = null;
let splashWindow = null;
let settingsWindow = null;
let tray = null;
let isQuitting = false;
let firstPaintDone = false;
let loginTimer = null;

// ---------------------------------------------------------------------------
// Anmeldedaten
// ---------------------------------------------------------------------------

async function getCredentials() {
  try {
    const [email, password] = await Promise.all([
      keytar.getPassword(KEYTAR_SERVICE, 'email'),
      keytar.getPassword(KEYTAR_SERVICE, 'password'),
    ]);
    if (email && email.trim() && password && password.trim()) {
      return { email: email.trim(), password };
    }
  } catch (err) {
    console.error('[Hub] Keytar-Lesefehler:', err);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Automatischer Nextcloud-Login (ADFS/SAML, mehrstufig)
//
// Schritte:
//   1. Nextcloud-Loginseite -> "BBZ ADFS"-Button klicken (SAML starten)
//   2. ADFS-Formular -> Benutzername/Passwort ausfüllen und absenden
//   3. "Angemeldet bleiben?" -> "Ja" klicken
//   4. Eingeloggt -> nichts tun
// ---------------------------------------------------------------------------

async function runNextcloudLogin(wc) {
  const creds = await getCredentials();
  if (!creds) {
    openSettingsWindow();
    return;
  }
  const { email, password } = creds;

  let state;
  try {
    state = await wc.executeJavaScript(`
      (function() {
        const adfsButton = document.querySelector('a[href*="user_saml/saml/login"]') ||
                           Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'BBZ ADFS');
        const userNameInput = document.querySelector('#userNameInput');
        const passwordInput = document.querySelector('#passwordInput');
        const submitButton = document.querySelector('#submitButton');
        const jaButton = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');
        const loggedIn = document.querySelector('#header') ||
                         document.querySelector('.app-navigation') ||
                         document.querySelector('#nextcloud') ||
                         window.location.href.includes('/apps/');
        return {
          adfsButton: !!adfsButton,
          userNameInput: !!userNameInput,
          passwordInput: !!passwordInput,
          submitButton: !!submitButton,
          jaButton: !!jaButton,
          loggedIn: !!loggedIn,
        };
      })()
    `);
  } catch (err) {
    return; // Seite mitten in Navigation – nächster Trigger versucht es erneut
  }

  if (state.loggedIn) {
    stopLoginPolling();
    revealMainWindow();
    return;
  }

  if (state.adfsButton) {
    await wc.executeJavaScript(`
      (function() {
        const b = document.querySelector('a[href*="user_saml/saml/login"]') ||
                  Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'BBZ ADFS');
        if (b) b.click();
      })()
    `).catch(() => {});
    return;
  }

  if (state.userNameInput && state.passwordInput && state.submitButton) {
    await wc.executeJavaScript(`
      (function() {
        const setVal = (el, val) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, val);
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const u = document.querySelector('#userNameInput');
        const p = document.querySelector('#passwordInput');
        const s = document.querySelector('#submitButton');
        if (u) setVal(u, ${JSON.stringify(email)});
        if (p) setVal(p, ${JSON.stringify(password)});
        if (s) setTimeout(() => s.click(), 500);
      })()
    `).catch(() => {});
    return;
  }

  if (state.jaButton) {
    await wc.executeJavaScript(`
      (function() {
        const b = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');
        if (b) setTimeout(() => b.click(), 500);
      })()
    `).catch(() => {});
  }
}

function startLoginPolling(wc) {
  stopLoginPolling();
  // Periodischer Versuch, falls ein Login-Schritt ohne Navigation erscheint.
  loginTimer = setInterval(() => {
    if (wc && !wc.isDestroyed()) runNextcloudLogin(wc).catch(() => {});
  }, 4000);
}

function stopLoginPolling() {
  if (loginTimer) {
    clearInterval(loginTimer);
    loginTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Talk-Badge (ungelesene Nachrichten aus dem Seitentitel)
// ---------------------------------------------------------------------------

function updateBadge(title) {
  const match = title && title.match(/\((\d+)\)/);
  const count = match ? parseInt(match[1], 10) : 0;
  try {
    app.setBadgeCount(count); // macOS / Linux (Unity)
  } catch (_) {}
  if (tray) {
    const icon = count > 0 ? 'tray_badge.png' : 'tray.png';
    try {
      tray.setImage(nativeImage.createFromPath(ASSET(icon)));
    } catch (_) {}
    tray.setToolTip(count > 0 ? `BBZ Cloud Hub – ${count} neue Nachricht(en)` : 'BBZ Cloud Hub');
  }
  if (process.platform === 'win32' && mainWindow) {
    const overlay = count > 0 ? nativeImage.createFromPath(ASSET('tray_badge.png')) : null;
    try {
      mainWindow.setOverlayIcon(overlay, count > 0 ? `${count} neu` : '');
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Fenster
// ---------------------------------------------------------------------------

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    resizable: false,
    center: true,
    show: true,
    alwaysOnTop: true,
    backgroundColor: '#1a202c',
    webPreferences: { contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function revealMainWindow() {
  if (firstPaintDone) return;
  firstPaintDone = true;
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
}

function createMainWindow() {
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(CHROME_UA);

  // Kamera/Mikrofon/Benachrichtigungen für Hub + BBB erlauben.
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    const allowed = ['media', 'notifications', 'fullscreen', 'pointerLock', 'display-capture', 'clipboard-read'];
    callback(allowed.includes(permission));
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    backgroundColor: '#1a202c',
    icon: ASSET('icon.png'),
    title: 'BBZ Cloud Hub',
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // bleibt "warm", auch minimiert
      spellcheck: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  const wc = mainWindow.webContents;
  wc.setUserAgent(CHROME_UA);

  // Auto-Login an jeder relevanten Navigation/Seitenfertigstellung anstoßen.
  wc.on('dom-ready', () => runNextcloudLogin(wc).catch(() => {}));
  wc.on('did-navigate', () => runNextcloudLogin(wc).catch(() => {}));
  wc.on('did-navigate-in-page', () => runNextcloudLogin(wc).catch(() => {}));

  // Spätestens nach dem ersten Laden das Fenster zeigen (kein Weiß-Blitz).
  wc.once('did-stop-loading', () => revealMainWindow());
  // Sicherheitsnetz, falls Login/Netz hängt.
  setTimeout(revealMainWindow, 12000);

  wc.on('page-title-updated', (e, title) => {
    e.preventDefault();
    mainWindow.setTitle('BBZ Cloud Hub');
    updateBadge(title);
  });

  // Link-Handling: Hub-eigene Popups + BBB-Meetings im eigenen Fenster,
  // alles andere (mailto, externe Seiten) im Standardbrowser.
  wc.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.hostname === HUB_HOST || MEETING_HOSTS.includes(u.hostname)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            backgroundColor: '#1a202c',
            webPreferences: { session: session.fromPartition(PARTITION), contextIsolation: true },
          },
        };
      }
    } catch (_) {}
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    // In den Tray minimieren statt beenden.
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  registerShortcuts(wc);
  startLoginPolling(wc);
  wc.loadURL(HUB_URL);
}

// Tastaturkürzel: Zurück/Vor/Neu laden/Start/Einstellungen.
function registerShortcuts(wc) {
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    const ctrl = input.control || input.meta;

    if (input.alt && key === 'arrowleft' && wc.canGoBack()) {
      wc.goBack();
      event.preventDefault();
    } else if (input.alt && key === 'arrowright' && wc.canGoForward()) {
      wc.goForward();
      event.preventDefault();
    } else if ((ctrl && key === 'r') || key === 'f5') {
      wc.reload();
      event.preventDefault();
    } else if (input.alt && key === 'home') {
      wc.loadURL(HUB_URL);
      event.preventDefault();
    } else if (ctrl && key === ',') {
      openSettingsWindow();
      event.preventDefault();
    }
  });
}

// ---------------------------------------------------------------------------
// Einstellungen (Anmeldedaten)
// ---------------------------------------------------------------------------

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 460,
    height: 420,
    resizable: false,
    title: 'Anmeldedaten – BBZ Cloud Hub',
    parent: mainWindow || undefined,
    modal: !!mainWindow,
    backgroundColor: '#1a202c',
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

ipcMain.handle('get-credentials', async () => {
  const email = await keytar.getPassword(KEYTAR_SERVICE, 'email').catch(() => null);
  return { email: email || '' };
});

ipcMain.handle('save-credentials', async (_e, { email, password }) => {
  try {
    await keytar.setPassword(KEYTAR_SERVICE, 'email', (email || '').trim());
    if (password) await keytar.setPassword(KEYTAR_SERVICE, 'password', password);
    // Nach dem Speichern frisch laden und Login neu anstoßen.
    if (mainWindow && !mainWindow.isDestroyed()) {
      const wc = mainWindow.webContents;
      startLoginPolling(wc);
      wc.loadURL(HUB_URL);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(ASSET('tray.png')));
  } catch (err) {
    console.error('[Hub] Tray konnte nicht erstellt werden:', err);
    return;
  }
  const menu = Menu.buildFromTemplate([
    { label: 'Hub öffnen', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { label: 'Neu laden', click: () => { if (mainWindow) mainWindow.webContents.loadURL(HUB_URL); } },
    { type: 'separator' },
    { label: 'Anmeldedaten …', click: openSettingsWindow },
    { label: 'Auf Updates prüfen', click: () => autoUpdater.checkForUpdatesAndNotify() },
    { type: 'separator' },
    { label: 'Beenden', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setToolTip('BBZ Cloud Hub');
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });
}

// ---------------------------------------------------------------------------
// Auto-Update
// ---------------------------------------------------------------------------

function setupAutoUpdate() {
  autoUpdater.autoDownload = true;
  autoUpdater.on('update-downloaded', () => {
    // Beim nächsten Beenden installieren – nicht aufdringlich.
    app.once('before-quit', () => {
      try { autoUpdater.quitAndInstall(false, true); } catch (_) {}
    });
  });
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6 * 60 * 60 * 1000);
  }
}

// ---------------------------------------------------------------------------
// App-Lebenszyklus
// ---------------------------------------------------------------------------

// Einzelinstanz erzwingen – ein zweiter Start fokussiert das vorhandene Fenster.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createSplashWindow();
    createMainWindow();
    createTray();
    setupAutoUpdate();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      else if (mainWindow) mainWindow.show();
    });
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  stopLoginPolling();
});

// Tray-App: nicht beenden, wenn alle Fenster zu sind (außer macOS-Konvention).
app.on('window-all-closed', () => {
  // Bewusst leer: App lebt im Tray weiter.
});
