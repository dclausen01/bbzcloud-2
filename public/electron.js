const { app, BrowserWindow, ipcMain, shell, nativeImage, Menu, Tray, dialog, webContents, powerMonitor } = require('electron');
const path = require('path');

// List of webviews that need to be reloaded on system resume
const webviewsToReload = ['outlook', 'wiki', 'handbook', 'moodle', 'webuntis'];
const isDev = require('electron-is-dev');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const keytar = require('keytar');
const fs = require('fs-extra');
const { Notification } = require('electron');

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

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

// Initialize electron store with schema
const store = new Store({
  schema: {
    todos: {
      type: 'array',
      default: []
    },
    todoFolders: {
      type: 'array',
      default: ['Default']
    },
    settings: {
        type: 'object',
        properties: {
          navigationButtons: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                visible: { type: 'boolean' },
                url: { type: 'string' },
                title: { type: 'string' },
                buttonVariant: { type: 'string' },
                favicon: { type: 'string' },
                zoom: { type: 'number' }
              }
            }
          },
          customApps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                url: { type: 'string' },
                buttonVariant: { type: 'string' },
                favicon: { type: 'string' },
                zoom: { type: 'number' }
              }
            }
          },
          theme: { type: 'string' },
          globalZoom: { type: 'number' },
          autostart: { type: 'boolean', default: true },
          minimizedStart: { type: 'boolean', default: false },
          windowState: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
              isMaximized: { type: 'boolean' }
            }
          }
      }
    }
  },
  migrations: {
    '1.0.0': store => {
      const settings = store.get('settings');
      if (settings?.navigationButtons?.bbb) {
        settings.navigationButtons.bbb.url = 'https://bbb.bbz-rd-eck.de/b/signin';
        store.set('settings', settings);
      }
    }
  },
  clearInvalidConfig: true
});

// Run migrations
store.get('settings');

let mainWindow;
let splashWindow;
let tray;
let messageBoxIsDisplayed = false;
const windowRegistry = new Map();

const downloadTypes = [
  '.mp4', '.mp3', '.ogg', '.flac', '.wav', '.mkv', '.mov', '.wmv',
  '.oga', '.ogv', '.opus', '.xls', '.xlsx', '.ppt', '.zip', '.exe',
  '.AppImage', '.snap', '.bin', '.sh', '.doc', '.docx', '.fls', '.pdf'
];

const keywordsMicrosoft = ['onedrive', 'onenote', 'download.aspx'];

// Update autostart based on settings
function updateAutostart() {
  const settings = store.get('settings');
  const shouldAutostart = settings?.autostart ?? true;
  
  if (!isDev) {
    app.setLoginItemSettings({
      openAtLogin: shouldAutostart,
      path: app.getPath('exe'),
      args: ['--hidden']
    });
  }
}

function isDownloadType(url) {
  return downloadTypes.some(type => url.includes(type));
}

function isMicrosoft(url) {
  return keywordsMicrosoft.some(keyword => url.includes(keyword));
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
  const trayIcon = getAssetPath('tray.png');
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

function createWindow() {
  const windowState = restoreWindowState();
  const settings = store.get('settings');
  const shouldStartMinimized = settings?.minimizedStart || process.argv.includes('--hidden');
  
  mainWindow = new BrowserWindow({
    ...windowState,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    skipTaskbar: shouldStartMinimized,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      webSecurity: false,
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

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.minimize();
    }
    return false;
  });

  mainWindow.on('minimize', (event) => {
    mainWindow.setSkipTaskbar(false);
  });

  mainWindow.on('restore', () => {
    mainWindow.setSkipTaskbar(false);
  });

  mainWindow.on('hide', () => {
    mainWindow.setSkipTaskbar(true);
  });

  mainWindow.on('show', () => {
    mainWindow.setSkipTaskbar(false);
    if (windowState.isMaximized) {
      mainWindow.maximize();
    }
  });

  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow) {
        splashWindow.close();
      }
      if (shouldStartMinimized) {
        mainWindow.minimize();
      } else {
        if (windowState.isMaximized) {
          mainWindow.maximize();
        }
        mainWindow.show();
      }
    }, 3000);
  });
}

function createWebviewWindow(url, title) {
  const settings = store.get('settings');
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
      webSecurity: false,
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

async function saveCredentials(service, account, password) {
  try {
    await keytar.setPassword(service, account, password);
    return true;
  } catch (error) {
    console.error('Error saving credentials:', error);
    return false;
  }
}

async function getCredentials(service, account) {
  try {
    return await keytar.getPassword(service, account);
  } catch (error) {
    console.error('Error getting credentials:', error);
    return null;
  }
}

function createContextMenu(webContents) {
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
        webContents.executeJavaScript(`window.getSelection().toString()`)
          .then(selectedText => {
            if (selectedText) {
              mainWindow.webContents.send('add-todo', selectedText);
            }
          })
          .catch(error => {
            console.error('Error getting selected text:', error);
          });
      }
    }
  ]);
}

// Todo related IPC handlers
ipcMain.handle('save-todos', async (event, todos) => {
  try {
    store.set('todos', todos);
    return { success: true };
  } catch (error) {
    console.error('Error saving todos:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-todos', async () => {
  try {
    const todos = store.get('todos', []);
    return todos;
  } catch (error) {
    console.error('Error getting todos:', error);
    return [];
  }
});

ipcMain.handle('save-todo-folders', async (event, folders) => {
  try {
    store.set('todoFolders', folders);
    return { success: true };
  } catch (error) {
    console.error('Error saving todo folders:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-todo-folders', async () => {
  try {
    const folders = store.get('todoFolders', ['Default']);
    return folders;
  } catch (error) {
    console.error('Error getting todo folders:', error);
    return ['Default'];
  }
});

ipcMain.handle('save-todo-sort-type', async (event, sortType) => {
  try {
    store.set('todoSortType', sortType);
    return { success: true };
  } catch (error) {
    console.error('Error saving todo sort type:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-todo-sort-type', async () => {
  try {
    const sortType = store.get('todoSortType', 'manual');
    return sortType;
  } catch (error) {
    console.error('Error getting todo sort type:', error);
    return 'manual';
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
    const result = await saveCredentials(service, account, password);
    return { success: result };
  } catch (error) {
    console.error('Error in save-credentials:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.on('update-badge', (event, isBadge) => {
  if (isBadge) {
    mainWindow?.setOverlayIcon(
      nativeImage.createFromPath(getAssetPath('icon_badge.png')),
      'NeueNachrichten'
    );
    mainWindow?.setIcon(getAssetPath('icon_badge_combined.png'));
    if (process.platform === 'win32' || process.platform === 'darwin') {
      tray?.setImage(getAssetPath('tray-lowres_badge.png'));
    } else {
      tray?.setImage(getAssetPath('tray_badge.png'));
    }
  } else {
    mainWindow?.setOverlayIcon(null, 'Keine Nachrichten');
    mainWindow?.setIcon(getAssetPath('icon.png'));
    if (process.platform === 'win32' || process.platform === 'darwin') {
      tray?.setImage(getAssetPath('tray-lowres.png'));
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
    store.set('settings', settings);
    updateAutostart();
    const theme = settings.theme || 'light';
    
    // Send theme change to all windows
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('theme-changed', theme);
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error saving settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-settings', async () => {
  try {
    const settings = store.get('settings');
    return { success: true, settings };
  } catch (error) {
    console.error('Error getting settings:', error);
    return { success: false, error: error.message };
  }
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
      const menu = createContextMenu(contents);
      menu.popup();
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

    if (isMicrosoft(url) && !url.includes('stashcat')) {
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

app.on('ready', async () => {
  if (!gotTheLock) {
    app.quit();
    return;
  }
  
  await copyAssetsIfNeeded();
  updateAutostart();
  createTray();
  createSplashWindow();
  createWindow();
  autoUpdater.checkForUpdatesAndNotify();

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

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
    const settings = store.get('settings');
    if (settings?.minimizedStart || process.argv.includes('--hidden')) {
      mainWindow?.minimize();
    }
  } else {
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
});
