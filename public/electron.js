const { app, BrowserWindow, ipcMain, shell, nativeImage, Menu, Tray, dialog, webContents, powerMonitor } = require('electron');
const path = require('path');
const zlib = require('zlib');
const util = require('util');
const crypto = require('crypto');
const compress = util.promisify(zlib.gzip);
const decompress = util.promisify(zlib.gunzip);

// List of webviews that need to be reloaded on system resume
const webviewsToReload = ['outlook', 'wiki', 'handbook', 'moodle', 'webuntis'];
const isDev = require('electron-is-dev');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const keytar = require('keytar');
const fs = require('fs-extra');
const { Notification } = require('electron');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const DatabaseService = require('./services/DatabaseService');

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
let shouldStartMinimized = false;
let globalTheme = 'light';

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      const windowState = store.get('settings.windowState');
      if (windowState?.isMaximized) {
        mainWindow.maximize();
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
    }
  });
}

// Feedback handler
ipcMain.handle('create-github-issue', async (event, { title, body }) => {
  try {
    // Create a formatted email body
    const emailBody = `Feedback: ${title}\n\nBeschreibung:\n${body}`;
    const mailtoUrl = `mailto:dennis.clausen@bbz-rd-eck.de?subject=${encodeURIComponent('BBZCloud Feedback: ' + title)}&body=${encodeURIComponent(emailBody)}`;
    
    // Open default email client
    shell.openExternal(mailtoUrl);
    return { success: true };
  } catch (error) {
    console.error('Error creating GitHub issue:', error);
    return { success: false, error: error.message };
  }
});

// Secure deletion function
const secureDelete = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    
    // Overwrite with random data 3 times
    for (let i = 0; i < 3; i++) {
      const randomData = Buffer.alloc(fileSize);
      crypto.randomFillSync(randomData);
      await fs.writeFile(filePath, randomData);
    }
    
    // Zero out the file
    await fs.writeFile(filePath, Buffer.alloc(fileSize));
    
    // Finally delete
    await fs.unlink(filePath);
  } catch (error) {
    console.error('Error in secure delete:', error);
    // Attempt normal delete as fallback
    await fs.remove(filePath);
  }
};

// Initialize electron store with minimal schema for window state and secure store
const store = new Store({
  schema: {
    windowState: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        isMaximized: { type: 'boolean' }
      }
    },
    secureStore: {
      type: 'object',
      properties: {
        salt: { type: 'string' },
        passwordHash: { type: 'string' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              size: { type: 'string' },
              date: { type: 'string' },
              encryptedPath: { type: 'string' }
            }
          },
          default: []
        }
      },
      default: {
        salt: '',
        passwordHash: '',
        files: []
      }
    },
    databasePath: {
      type: 'string'
    }
  },
  clearInvalidConfig: true
});

// Initialize database service
const db = new DatabaseService();

// File change detection
let fileWatcher = null;
let lastKnownTimestamp = 0;

async function setupFileWatcher() {
  if (fileWatcher) {
    fileWatcher.close();
  }

  const dbPath = db.getDatabasePath();
  lastKnownTimestamp = await db.getLastUpdateTimestamp();

  // Instead of watching file changes, set up a periodic check every minute
  const checkDatabaseChanges = async () => {
    const currentTimestamp = await db.getLastUpdateTimestamp();
    if (currentTimestamp > lastKnownTimestamp) {
      lastKnownTimestamp = currentTimestamp;
      mainWindow?.webContents.send('database-changed');
    }
  };

  // Initial check
  checkDatabaseChanges();

  // Set up periodic check every minute
  const intervalId = setInterval(checkDatabaseChanges, 60000);

  // Clean up interval when app quits
  app.on('before-quit', () => {
    clearInterval(intervalId);
  });
}

let mainWindow;
let splashWindow;
let tray;
const windowRegistry = new Map();

// Update autostart based on settings
async function updateAutostart() {
  const { settings } = await db.getSettings();
  const shouldAutostart = settings?.autostart ?? true;
  
  if (!isDev) {
    app.setLoginItemSettings({
      openAtLogin: shouldAutostart,
      path: app.getPath('exe'),
      args: ['--hidden']
    });
  }
}

const getAssetPath = (asset) => {
  if (isDev) {
    return path.resolve(app.getAppPath(), 'assets', 'images', asset);
  }
  return path.resolve(process.resourcesPath, 'assets', 'images', asset);
};

function saveWindowState() {
  const bounds = mainWindow.getBounds();
  const isMaximized = mainWindow.isMaximized();
  store.set('settings.windowState', {
    ...bounds,
    isMaximized
  });
}

function restoreWindowState() {
  const windowState = store.get('settings.windowState');
  if (windowState) {
    return windowState;
  }
  return {
    width: 1450,
    height: 800
  };
}

const copyAssetsIfNeeded = async () => {
  if (!isDev) {
    try {
      const sourceDir = path.join(app.getAppPath(), 'assets');
      const targetDir = path.join(process.resourcesPath, 'assets');
      await fs.ensureDir(targetDir);
      await fs.copy(sourceDir, targetDir, { overwrite: true });
    } catch (error) {
      console.error('Error copying assets:', error);
    }
  }
};

function createTray() {
  let trayIcon;
  if (process.platform === 'darwin') {
    trayIcon = nativeImage.createFromPath(getAssetPath('tray-lowres.png')).resize({ width: 22, height: 22 });
  } else if (process.platform === 'win32') {
    trayIcon = getAssetPath('tray-lowres.png');
  } else {
    trayIcon = getAssetPath('tray.png');
  }
  tray = new Tray(trayIcon);
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Öffnen',
      click: () => {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        const windowState = store.get('settings.windowState');
        if (windowState?.isMaximized) {
          mainWindow.maximize();
        }
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: 'Fenster maximieren',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.maximize();
      }
    },
    { 
      label: 'Beenden',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('BBZCloud');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    const windowState = store.get('settings.windowState');
    if (windowState?.isMaximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
    mainWindow.focus();
  });
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 300,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: getAssetPath('icon.ico')
  });

  splashWindow.loadURL(
    isDev
      ? 'http://localhost:3000/splash.html'
      : `file://${path.join(__dirname, '../build/splash.html')}`
  );

  splashWindow.setMenu(null);
}

async function createWindow() {
  const windowState = restoreWindowState();
  // Ensure database is initialized before creating main window
  await db.ensureInitialized();
  
  // Debug: Check settings right before window creation
  const settings = await db.getSettings();
  shouldStartMinimized = settings?.minimizedStart;
  globalTheme = settings?.theme || 'light';

  mainWindow = new BrowserWindow({
    ...windowState,
    minWidth: 1000,
    minHeight: 700,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      webSecurity: true,
      partition: 'persist:main',
      additionalArguments: [
        `--webview-preload-script=${path.join(__dirname, 'webview-preload.js')}`
      ],
      sandbox: false
    },
    icon: getAssetPath('icon.ico')
  });

  mainWindow.loadURL(
    isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../build/index.html')}`
  );

  mainWindow.setMenu(null);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Save window state on various window events
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('close', saveWindowState);
  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);

  mainWindow.on('close', async (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.minimize();
    }
    return false;
  });

  mainWindow.once('ready-to-show', async () => {
    if (!shouldStartMinimized) {
      if (windowState.isMaximized) {
        mainWindow.maximize();
      }
      mainWindow.show();
    } else {
      mainWindow.minimize();
    }

    // Close splash window after a delay to ensure smooth transition
    setTimeout(() => {
      if (splashWindow) {
        splashWindow.close();
      }
    }, 3000);
  });
}

async function createWebviewWindow(url, title) {
  const { settings } = await db.getSettings();
  const theme = settings?.theme || 'light';
  
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 725,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      webSecurity: true,
      partition: 'persist:main',
      additionalArguments: [
        `--webview-preload-script=${path.join(__dirname, 'webview-preload.js')}`
      ],
      sandbox: false
    },
    icon: getAssetPath('icon.ico')
  });

  win.loadURL(
    isDev
      ? `http://localhost:3000/webview.html?url=${encodeURIComponent(url)}&theme=${theme}`
      : `file://${path.join(__dirname, '../build/webview.html')}?url=${encodeURIComponent(url)}&theme=${theme}`
  );

  win.setMenu(null);

  windowRegistry.set(url, win);

  win.on('closed', () => {
    windowRegistry.delete(url);
  });

  return win;
}

async function getCredentials(service, account) {
  try {
    return await keytar.getPassword(service, account);
  } catch (error) {
    console.error('Error getting credentials:', error);
    return null;
  }
}

function createContextMenu(webContents, selectedText) {
  return Menu.buildFromTemplate([
    { 
      label: 'Ausschneiden',
      accelerator: 'CmdOrCtrl+X',
      role: 'cut'
    },
    { 
      label: 'Kopieren',
      accelerator: 'CmdOrCtrl+C',
      role: 'copy'
    },
    { 
      label: 'Einfügen',
      accelerator: 'CmdOrCtrl+V',
      role: 'paste'
    },
    { type: 'separator' },
    {
      label: 'Als Todo hinzufügen',
      click: () => {
        if (selectedText) {
          mainWindow.webContents.send('add-todo', selectedText);
        }
      }
    }
  ]);
}

// Database related IPC handlers
ipcMain.handle('get-database-path', () => {
  return db.getDatabasePath();
});

ipcMain.handle('change-database-location', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Wählen Sie einen Ordner für die Datenbank'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const selectedDir = result.filePaths[0];
      const newDbPath = path.join(selectedDir, 'bbzcloud.db');

      // Check if database file already exists
      if (fs.existsSync(newDbPath)) {
        const { response } = await dialog.showMessageBox(mainWindow, {
          type: 'question',
          buttons: ['Bestehende Datenbank verwenden', 'Neue Datenbank erstellen', 'Abbrechen'],
          defaultId: 0,
          title: 'Datenbank existiert bereits',
          message: 'Eine Datenbank existiert bereits in diesem Ordner.',
          detail: 'Möchten Sie die bestehende Datenbank verwenden oder eine neue erstellen?'
        });

        if (response === 2) { // Cancel
          return { success: false };
        }

        if (response === 1) { // Create new
          await fs.remove(newDbPath); // Delete existing file
          // Show new database creation dialog
          const { response: newDbResponse } = await dialog.showMessageBox(mainWindow, {
            type: 'info',
            buttons: ['OK', 'Abbrechen'],
            defaultId: 0,
            title: 'Neue Datenbank',
            message: 'Es wird eine neue Datenbank erstellt',
            detail: `Eine neue Datenbank wird im ausgewählten Ordner erstellt:\n${newDbPath}`
          });

          if (newDbResponse === 1) { // Cancel
            return { success: false };
          }
        }
      } else {
        // If no database exists, inform user and create new
        const { response } = await dialog.showMessageBox(mainWindow, {
          type: 'info',
          buttons: ['OK', 'Abbrechen'],
          defaultId: 0,
          title: 'Neue Datenbank',
          message: 'Es wird eine neue Datenbank erstellt',
          detail: `Eine neue Datenbank wird im ausgewählten Ordner erstellt:\n${newDbPath}`
        });

        if (response === 1) { // Cancel
          return { success: false };
        }
      }

      await db.changeDatabaseLocation(newDbPath);
      await setupFileWatcher(); // Reset file watcher for new location
      return { success: true, path: newDbPath };
    }
    return { success: false };
  } catch (error) {
    console.error('Error changing database location:', error);
    return { success: false, error: error.message };
  }
});

// Todo related IPC handlers
ipcMain.handle('get-todo-state', async () => {
  try {
    const todoState = await db.getTodoState();
    return { success: true, todoState };
  } catch (error) {
    console.error('Error getting todo state:', error);
    return { 
      success: false, 
      error: error.message,
      todoState: {
        todos: [],
        folders: ['Default'],
        sortType: 'manual',
        selectedFolder: 'Default'
      }
    };
  }
});

ipcMain.handle('save-todo-state', async (event, todoState) => {
  try {
    await db.saveTodoState(todoState);
    return { success: true };
  } catch (error) {
    console.error('Error saving todo state:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('schedule-notification', async (event, { title, body, when }) => {
  try {
    const notification = new Notification({
      title,
      body,
      silent: false
    });

    const delay = when - Date.now();
    if (delay > 0) {
      setTimeout(() => {
        notification.show();
      }, delay);
    }

    return { success: true };
  } catch (error) {
    console.error('Error scheduling notification:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-credentials', async (event, { service, account, password }) => {
  try {
    await keytar.setPassword(service, account, password);
    return { success: true };
  } catch (error) {
    console.error('Error in save-credentials:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.on('update-badge', (event, isBadge) => {
  if (process.platform === 'win32') {
    // For Windows:
    // - Use icon_badge.png for overlay (just the notification dot)
    if (isBadge) {
      mainWindow?.setOverlayIcon(
        nativeImage.createFromPath(getAssetPath('icon_badge.png')),
        'NeueNachrichten'
      );
      mainWindow?.setIcon(getAssetPath('icon_badge_combined.png'));
      tray?.setImage(getAssetPath('tray-lowres_badge.png'));
    } else {
      mainWindow?.setOverlayIcon(null, 'Keine Nachrichten');
      mainWindow?.setIcon(getAssetPath('icon.png'));
      tray?.setImage(getAssetPath('tray-lowres.png'));
    }
  } else if (process.platform === 'darwin') {
    // For macOS
    if (isBadge) {
      const badgeIcon = nativeImage.createFromPath(getAssetPath('tray-lowres_badge.png')).resize({ width: 22, height: 22 });
      tray?.setImage(badgeIcon);
    } else {
      const normalIcon = nativeImage.createFromPath(getAssetPath('tray-lowres.png')).resize({ width: 22, height: 22 });
      tray?.setImage(normalIcon);
    }
  } else {
    // For Linux and others
    if (isBadge) {
      tray?.setImage(getAssetPath('tray_badge.png'));
    } else {
      tray?.setImage(getAssetPath('tray.png'));
    }
  }
});

ipcMain.handle('get-credentials', async (event, { service, account }) => {
  try {
    const password = await getCredentials(service, account);
    return { success: true, password };
  } catch (error) {
    console.error('Error in get-credentials:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-external-window', async (event, { url, title }) => {
  createWebviewWindow(url, title);
});

ipcMain.handle('inject-js', async (event, { webviewId, code }) => {
  try {
    const contents = webContents.fromId(webviewId);
    if (!contents) {
      throw new Error('Webview not found');
    }
    return await contents.executeJavaScript(code);
  } catch (error) {
    console.error('Error injecting JavaScript:', error);
    throw error;
  }
});

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    await db.saveSettings(settings);
    updateAutostart();
    const theme = settings.theme || globalTheme;
    
    // Send theme change to all windows and their webviews
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('theme-changed', theme);
      
      // Get all webviews in this window
      win.webContents.sendToFrame(
        // Send to all frames (webviews are considered frames)
        [...Array(win.webContents.frameCount)].map((_, i) => i),
        'theme-changed',
        theme
      );
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error saving settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-settings', async () => {
  try {
    const settings = await db.getSettings();
    shouldStartMinimized = settings?.minimizedStart;
    globalTheme = settings?.theme || 'light';
    return { success: true, settings: settings || {} };
  } catch (error) {
    console.error('Error getting settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-asset-path', async (event, asset) => {
  const assetPath = getAssetPath(asset);
  try {
    await fs.access(assetPath);
    return assetPath;
  } catch (error) {
    console.error('Asset not found:', assetPath);
    throw new Error(`Asset not found: ${asset}`);
  }
});

autoUpdater.on('checking-for-update', () => {
  mainWindow.webContents.send('update-status', 'Suche nach Updates...');
});

autoUpdater.on('update-available', (info) => {
  mainWindow.webContents.send('update-status', 'Update verfügbar.');
});

autoUpdater.on('update-not-available', (info) => {
  mainWindow.webContents.send('update-status', 'Keine Updates verfügbar.');
});

autoUpdater.on('error', (err) => {
  mainWindow.webContents.send('update-status', 'Fehler beim Auto-Update.');
});

autoUpdater.on('download-progress', (progressObj) => {
  mainWindow.webContents.send('update-status', `Download läuft... ${progressObj.percent}%`);
});

autoUpdater.on('update-downloaded', (info) => {
  mainWindow.webContents.send('update-status', 'Update heruntergeladen. Installation beim nächsten Neustart.');
});

// Handle context menu events from webviews
ipcMain.on('showContextMenu', (event, data) => {
  const menu = createContextMenu(event.sender, data.selectionText);
  menu.popup();
});

app.on('web-contents-created', (event, contents) => {
  contents.on('will-redirect', (e, url) => {
    if (
      url.includes('bbb.bbz-rd-eck.de/bigbluebutton/api/join?') ||
      url.includes('meet.stashcat.com')
    ) {
      e.preventDefault();
      BrowserWindow.getAllWindows().forEach((w) => {
        if (w.getTitle() === 'Electron' || w.getTitle() === 'BBZ Cloud') {
          w.close();
        }
      });
      // open url in external browser and activate the browser
      shell.openExternal(url, { activate: true });
    }
  });

  contents.on('context-menu', (e, params) => {
    const url = contents.getURL();
    if (
      url.includes('schul.cloud') ||
      url.includes('portal.bbz-rd-eck.com') ||
      url.includes('taskcards.app') ||
      url.includes('wiki.bbz-rd-eck.com') ||
      url.includes('moodle')
    ) {
      e.preventDefault();
      contents.executeJavaScript(`window.getSelection().toString()`)
        .then(selectedText => {
          const menu = createContextMenu(contents, selectedText);
          menu.popup();
        })
        .catch(error => {
          console.error('Error getting selected text:', error);
        });
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (
      url.includes('bbb.bbz-rd-eck.de/bigbluebutton/api/join?') ||
      url.includes('meet.stashcat.com')
    ) {
      shell.openExternal(url);
      return { action: 'deny' };
    }

    if ((url.toLowerCase().includes('onedrive') || url.toLowerCase().includes('sharepoint')) && !url.includes('stashcat')) {
      if (url.includes('about:blank') || url.includes('download') || url.includes('sharepoint')) {
        createWebviewWindow(url, 'Microsoft');
        return { action: 'deny' };
      }
    }

    return { action: 'allow' };
  });

  contents.session.on('will-download', (event, item, webContents) => {
    item.on('updated', (event, state) => {
      if (state === 'interrupted') {
        mainWindow.webContents.send('download', 'interrupted');
      } else if (state === 'progressing') {
        if (item.isPaused()) {
          mainWindow.webContents.send('download', 'paused');
        } else {
          const percent = item.getTotalBytes() 
            ? (item.getReceivedBytes() / item.getTotalBytes()) * 100 
            : -1;
          mainWindow.webContents.send('download', percent);
        }
      }
    });

    item.once('done', (event, state) => {
      let messageBoxIsDisplayed = false;
      if (state === 'completed') {
        mainWindow.webContents.send('download', 'completed');
        
        if (!messageBoxIsDisplayed) {
          messageBoxIsDisplayed = true;
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            buttons: ['Ok', 'Datei öffnen', 'Ordner öffnen'],
            title: 'Download',
            message: 'Download abgeschlossen'
          }).then((response) => {
            if (response.response === 1) {
              shell.openPath(item.getSavePath());
            }
            if (response.response === 2) {
              shell.openPath(path.dirname(item.getSavePath()));
            }
            messageBoxIsDisplayed = false;
          });
        }
      } else {
        mainWindow.webContents.send('download', 'failed');
      }
    });
  });
});

Menu.setApplicationMenu(null);

app.on('before-quit', () => {
  app.isQuitting = true;
  if (mainWindow) {
    saveWindowState();
  }
});

// Get encryption password from keytar
async function getEncryptionPassword() {
  try {
    const password = await keytar.getPassword('bbzcloud', 'password');
    if (!password) {
      throw new Error('Kein Passwort in den Einstellungen gefunden');
    }
    
    return password;
  } catch (error) {
    console.error('Error in getEncryptionPassword:', error);
    throw error;
  }
}

// Secure store handlers
ipcMain.handle('check-secure-store-access', async () => {
  try {
    const password = await getEncryptionPassword();
    return { success: Boolean(password) };
  } catch (error) {
    console.error('Error in check-secure-store-access:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-secure-files', async () => {
  try {
    const files = await db.getSecureDocuments();
    return { success: true, files };
  } catch (error) {
    console.error('Error listing files:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('encrypt-and-store-file', async (event, { data, name }) => {
  try {
    const password = await getEncryptionPassword();
    const fileContent = Buffer.from(data);
    
    // Compress the file content
    const compressedContent = await compress(fileContent);
    const fileId = uuidv4();
    
    const document = {
      id: fileId,
      name,
      size: `${(fileContent.length / 1024).toFixed(2)} KB`,
      date: new Date().toISOString(),
      content: compressedContent,
      compressed: true
    };
    
    await db.saveSecureDocument(document, password);
    return { success: true };
  } catch (error) {
    console.error('Error encrypting file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-secure-file', async (event, fileId) => {
  try {
    await db.deleteSecureDocument(fileId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting secure file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-secure-file', async (event, fileId) => {
  let tempPath = null;
  let watcher = null;
  
  try {
    const password = await getEncryptionPassword();
    const document = await db.getSecureDocument(fileId, password);
    
    // Decompress if needed
    const fileContent = document.compressed 
      ? await decompress(document.content)
      : document.content;
    
    // Create temp file with random name for security
    const tempFileName = `bbzcloud-secure-${uuidv4()}-${document.name}`;
    tempPath = path.join(os.tmpdir(), tempFileName);
    await fs.writeFile(tempPath, fileContent);
    
    // Open file with default application
    shell.openPath(tempPath);
    
    // Watch for changes
    watcher = fs.watch(tempPath, async () => {
      try {
        const updatedContent = await fs.readFile(tempPath);
        const compressedContent = await compress(updatedContent);
        
        const updatedDocument = {
          ...document,
          content: compressedContent,
          compressed: true,
          date: new Date().toISOString()
        };
        
        await db.saveSecureDocument(updatedDocument, password);
        await secureDelete(tempPath);
        
        // Notify frontend of file update
        mainWindow?.webContents.send('secure-file-updated');
      } catch (error) {
        console.error('Error updating encrypted file:', error);
      }
    });
    
    // Clean up temp file when app quits
    app.on('before-quit', async () => {
      if (watcher) watcher.close();
      if (tempPath) await secureDelete(tempPath);
    });
    
    return { success: true };
  } catch (error) {
    if (watcher) watcher.close();
    if (tempPath) await secureDelete(tempPath);
    console.error('Error opening secure file:', error);
    return { success: false, error: error.message };
  }
});

app.on('ready', async () => {
  if (!gotTheLock) {
    app.quit();
    return;
  }
  
  try {    
    // Clean up any leftover temp files
    const tempDir = os.tmpdir();
    const files = await fs.readdir(tempDir);
    for (const file of files) {
      if (file.includes('bbzcloud-secure-')) {
        await secureDelete(path.join(tempDir, file));
      }
    }
    
    await copyAssetsIfNeeded();
    await updateAutostart();
    createTray();
    createSplashWindow();
    await createWindow();
    await setupFileWatcher();
    autoUpdater.checkForUpdatesAndNotify();
  } catch (error) {
    console.error('Error during app initialization:', error);
  }

  // Handle system resume events
  powerMonitor.on('resume', () => {
    if (mainWindow) {
      mainWindow.webContents.send('system-resumed', webviewsToReload);
    }
  });

  powerMonitor.on('unlock-screen', () => {
    if (mainWindow) {
      mainWindow.webContents.send('system-resumed', webviewsToReload);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (mainWindow === null) {
    await createWindow();
  } else {
    if (!mainWindow.isVisible()) {
      if (shouldStartMinimized) {
        mainWindow.minimize();
      } else {
        const windowState = store.get('settings.windowState');
        if (windowState?.isMaximized) {
          mainWindow.maximize();
        }
        mainWindow.show();
        mainWindow.focus();
      }
    }
  }
});
