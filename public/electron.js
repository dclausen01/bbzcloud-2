const { app, BrowserWindow, ipcMain, shell, nativeImage, Menu, Tray, dialog, webContents, powerMonitor, screen, globalShortcut } = require('electron');
const path = require('path');
const zlib = require('zlib');
const util = require('util');
const crypto = require('crypto');
const compress = util.promisify(zlib.gzip);
const decompress = util.promisify(zlib.gunzip);

// Import WebContentsView Manager (modern replacement for deprecated BrowserView)
const WebContentsViewManager = require('./WebContentsViewManager');

// List of webviews that need special handling on system resume
const webviewsToReload = ['outlook', 'webuntis'];
const isDev = require('electron-is-dev');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const keytar = require('keytar');
const fs = require('fs-extra');
const { Notification } = require('electron');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const DatabaseService = require('./services/DatabaseService');

// Update check interval (15 minutes)
const UPDATE_CHECK_INTERVAL = 15 * 60 * 1000;
let updateCheckTimer;

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

// Prepare for update by handling specific webview sessions
async function prepareForUpdate() {
  // Only get webviews that need special handling
  const webviews = webContents.getAllWebContents().filter(wc => 
    wc.getType() === 'webview' && 
    (wc.getURL().includes('exchange.bbz-rd-eck.de/owa') || wc.getURL().includes('webuntis.com'))
  );

  // Handle specific webviews
  for (const webview of webviews) {
    try {
      const url = webview.getURL();
      if (url.includes('exchange.bbz-rd-eck.de/owa')) {
        await webview.loadURL('https://exchange.bbz-rd-eck.de/owa/');
      } else if (url.includes('webuntis.com')) {
        await webview.loadURL('https://neilo.webuntis.com/WebUntis/?school=bbz-rd-eck#/basic/login');
      }
    } catch (error) {
      console.error('Error preparing webview for update:', error);
    }
  }
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

let mainWindow;
let splashWindow;
let tray;
const windowRegistry = new Map();

// WebContentsView Manager instance (modern replacement for deprecated BrowserView)
let webContentsViewManager = null;

// macOS-specific memory optimization
let imageCache = new Map();
let lastImageCleanup = Date.now();
const IMAGE_CACHE_CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Optimized image loading for macOS
function getOptimizedImage(imagePath, options = {}) {
  const cacheKey = `${imagePath}-${JSON.stringify(options)}`;
  
  // Check if we need to cleanup old images
  const now = Date.now();
  if (now - lastImageCleanup > IMAGE_CACHE_CLEANUP_INTERVAL) {
    imageCache.clear();
    lastImageCleanup = now;
    if (process.platform === 'darwin') {
      console.log('[macOS] Cleared image cache to free memory');
    }
  }
  
  // Return cached image if available
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey);
  }
  
  // Create new image
  let image = nativeImage.createFromPath(imagePath);
  
  // Apply options
  if (options.resize) {
    image = image.resize(options.resize);
  }
  
  // Cache the image (limit cache size on macOS)
  if (process.platform === 'darwin' && imageCache.size < 20) {
    imageCache.set(cacheKey, image);
  } else if (process.platform !== 'darwin') {
    imageCache.set(cacheKey, image);
  }
  
  return image;
}

// Enhanced webview session cleanup for macOS
function cleanupWebviewSessions() {
  if (process.platform !== 'darwin') return;
  
  try {
    const allWebContents = webContents.getAllWebContents();
    const webviews = allWebContents.filter(wc => wc.getType() === 'webview');
    
    console.log(`[macOS] Found ${webviews.length} webview sessions for cleanup`);
    
    webviews.forEach((webview, index) => {
      try {
        // Clear cache for webviews that haven't been used recently
        if (webview.session && !webview.isDestroyed()) {
          webview.session.clearCache();
          
          // Clear storage data for non-essential webviews
          const url = webview.getURL();
          if (!url.includes('exchange.bbz-rd-eck.de') && !url.includes('webuntis.com')) {
            webview.session.clearStorageData({
              storages: ['cookies', 'localstorage', 'sessionstorage', 'websql']
            });
          }
        }
      } catch (error) {
        console.error(`[macOS] Error cleaning webview ${index}:`, error);
      }
    });
  } catch (error) {
    console.error('[macOS] Error during webview session cleanup:', error);
  }
}

// Setup periodic cleanup for macOS
if (process.platform === 'darwin') {
  setInterval(() => {
    cleanupWebviewSessions();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('[macOS] Forced garbage collection');
    }
  }, 15 * 60 * 1000); // Every 15 minutes
}

// Update autostart based on settings
async function updateAutostart() {
  try {
    // Ensure database is initialized before trying to get settings
    await db.ensureInitialized();
    
    const result = await db.getSettings();
    const settings = result?.settings || result || {};
    const shouldAutostart = settings?.autostart ?? false;
    
    console.log('[Autostart] Current settings:', {
      autostart: settings?.autostart,
      shouldAutostart,
      isDev,
      platform: process.platform
    });
    
    // Skip autostart setup in development mode
    if (isDev) {
      console.log('[Autostart] Skipping autostart setup in development mode');
      return;
    }
    
    const appPath = app.getPath('exe');
    const args = [];
    
    // Add platform-specific settings
    if (process.platform === 'win32') {
      // For Windows, use the minimized argument if needed
      if (settings?.minimizedStart) {
        args.push('--minimized');
      }
    } else if (process.platform === 'linux') {
      // For Linux, handle AppImage and regular binary
      if (process.env.APPIMAGE) {
        // If running as AppImage, use the APPIMAGE path
        console.log('[Autostart] Using AppImage path:', process.env.APPIMAGE);
      }
      if (settings?.minimizedStart) {
        args.push('--minimized');
      }
    } else if (process.platform === 'darwin') {
      // For macOS, handle minimized start
      if (settings?.minimizedStart) {
        args.push('--minimized');
      }
    }
    
    const loginItemSettings = {
      openAtLogin: shouldAutostart,
      path: process.env.APPIMAGE || appPath, // Use AppImage path if available
      args: args,
      enabled: shouldAutostart
    };
    
    app.setLoginItemSettings(loginItemSettings);
    
    console.log('[Autostart] Login item settings updated:', loginItemSettings);
    
    // Verify the settings were applied correctly
    const currentSettings = app.getLoginItemSettings();
    console.log('[Autostart] Current login item settings:', currentSettings);
    
    if (currentSettings.openAtLogin !== shouldAutostart) {
      console.warn('[Autostart] Warning: Login item settings may not have been applied correctly');
    }
    
  } catch (error) {
    console.error('[Autostart] Error updating autostart settings:', error);
    
    // Try a fallback approach for critical errors
    if (!isDev) {
      try {
        console.log('[Autostart] Attempting fallback autostart setup');
        app.setLoginItemSettings({
          openAtLogin: false, // Disable as fallback
          enabled: false
        });
      } catch (fallbackError) {
        console.error('[Autostart] Fallback autostart setup also failed:', fallbackError);
      }
    }
  }
}

const getAssetPath = (asset) => {
  const assetPath = isDev
    ? path.resolve(app.getAppPath(), 'assets')
    : path.resolve(process.resourcesPath, 'assets');

  // If the asset path includes a subdirectory (like icons/file.svg), use it directly
  if (asset.includes('/')) {
    return path.resolve(assetPath, asset);
  }
  
  // Otherwise, assume it's in the images directory
  return path.resolve(assetPath, 'images', asset);
};

function saveWindowState() {
  const bounds = mainWindow.getBounds();
  const isMaximized = mainWindow.isMaximized();
  store.set('settings.windowState', {
    ...bounds,
    isMaximized
  });
}

function ensureWindowBoundsVisible(savedBounds) {
  // Get all available displays
  const displays = screen.getAllDisplays();
  
  // Calculate total visible area
  const visibleArea = displays.reduce((area, display) => {
    const { x, y, width, height } = display.bounds;
    
    area.minX = Math.min(area.minX, x);
    area.minY = Math.min(area.minY, y);
    area.maxX = Math.max(area.maxX, x + width);
    area.maxY = Math.max(area.maxY, y + height);
    
    return area;
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

  // Check if window is completely outside visible area
  const isWindowVisible = !(
    savedBounds.x >= visibleArea.maxX ||
    savedBounds.x + savedBounds.width <= visibleArea.minX ||
    savedBounds.y >= visibleArea.maxY ||
    savedBounds.y + savedBounds.height <= visibleArea.minY
  );

  if (!isWindowVisible) {
    // If not visible, center window on primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    return {
      width: savedBounds.width,
      height: savedBounds.height,
      x: Math.round((width - savedBounds.width) / 2),
      y: Math.round((height - savedBounds.height) / 2)
    };
  }

  return savedBounds;
}

function restoreWindowState() {
  const windowState = store.get('settings.windowState');
  if (windowState) {
    return ensureWindowBoundsVisible(windowState);
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
      
      // Ensure target directories exist
      await fs.ensureDir(path.join(targetDir, 'images'));
      await fs.ensureDir(path.join(targetDir, 'icons'));
      
      // Copy images directory
      await fs.copy(
        path.join(sourceDir, 'images'),
        path.join(targetDir, 'images'),
        { overwrite: true }
      );
      
      // Copy icons directory
      await fs.copy(
        path.join(sourceDir, 'icons'),
        path.join(targetDir, 'icons'),
        { overwrite: true }
      );
    } catch (error) {
      console.error('Error copying assets:', error);
    }
  }
};

function createTray() {
  let trayIcon;
  if (process.platform === 'darwin') {
    trayIcon = getOptimizedImage(getAssetPath('tray-lowres.png'), { resize: { width: 22, height: 22 } });
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
      preload: path.join(__dirname, 'preload.js'),
      devTools: isDev // Only enable DevTools in development
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

// Calculate minWidth based on zoom factor
function calculateMinWidth(zoomFactor) {
  const baseMinWidth = 1000; // Reduced from 1150 to align with new threshold values
   
  // Dampen the zoom factor's effect
  const dampening = 0.6; // Reduced from 0.75 for more gradual transitions
  const zoomDiff = zoomFactor - 1.0; // How far we are from normal zoom
  const dampedZoom = 1.0 + (zoomDiff * dampening); // Apply dampening to the difference
    
  // Calculate width with dampened zoom
  const width = Math.round(baseMinWidth * dampedZoom);
  
  // Ensure width stays within reasonable bounds
  const minAllowed = Math.round(baseMinWidth * 0.65); // Increased from 0.55 to account for new min zoom of 0.8
  const maxAllowed = Math.round(baseMinWidth * 1.85); // Increased from 1.75 to account for new max zoom of 1.4
  
  return Math.min(Math.max(width, minAllowed), maxAllowed);
}

async function createWindow() {
  const windowState = restoreWindowState();
  // Ensure database is initialized before creating main window
  await db.ensureInitialized();
  
  // Debug: Check settings right before window creation
  const settings = await db.getSettings();
  shouldStartMinimized = settings?.minimizedStart;
  globalTheme = settings?.theme || 'light';
  
  const initialMinWidth = calculateMinWidth(settings?.navbarZoom || 1.0);

  mainWindow = new BrowserWindow({
    ...windowState,
    minWidth: initialMinWidth,
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
      sandbox: false,
      devTools: isDev // Only enable DevTools in development
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
      mainWindow.hide();
      }
    return false;
  });

  // Initialize WebContentsView Manager IMMEDIATELY after window creation
  webContentsViewManager = new WebContentsViewManager(mainWindow);
  console.log('[Main] WebContentsViewManager initialized early');

  mainWindow.once('ready-to-show', async () => {
    const startMinimized = shouldStartMinimized || process.argv.includes('--minimized');
    
    if (!startMinimized) {
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
  // Get current theme from settings
  const { settings } = await db.getSettings();
  const theme = settings?.theme || globalTheme;
  globalTheme = theme; // Update global theme to ensure consistency
  
  // Create the window with the current theme and ensure session persistence
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
      partition: 'persist:main', // Main window partition
      additionalArguments: [
        `--webview-preload-script=${path.join(__dirname, 'webview-preload.js')}`
      ],
      sandbox: false,
      devTools: isDev // Only enable DevTools in development
    },
    icon: getAssetPath('icon.ico')
  });

  // Only open DevTools in development
  if (isDev) {
    win.webContents.openDevTools();
  }

  // Load URL with current theme
  const urlWithTheme = isDev
    ? `http://localhost:3000/webview.html?url=${encodeURIComponent(url)}&theme=${theme}`
    : `file://${path.join(__dirname, '../build/webview.html')}?url=${encodeURIComponent(url)}&theme=${theme}`;
  
  win.loadURL(urlWithTheme);

  // Register this window in the registry for theme updates
  windowRegistry.set(url, win);

  win.setMenu(null);

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

// Custom apps handlers
ipcMain.handle('get-custom-apps', async () => {
  try {
    const apps = await db.getCustomApps();
    return { success: true, apps };
  } catch (error) {
    console.error('Error getting custom apps:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-custom-apps', async (event, apps) => {
  try {
    await db.saveCustomApps(apps);
    return { success: true };
  } catch (error) {
    console.error('Error saving custom apps:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('shell-open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Error opening external URL:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('reencrypt-data', async (event, { oldPassword, newPassword }) => {
  try {
    await db.reencryptData(oldPassword, newPassword);
    return { success: true };
  } catch (error) {
    console.error('Error reencrypting data:', error);
    return { success: false, error: error.message };
  }
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
      // await setupFileWatcher(); // Reset file watcher for new location
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
  try {
    if (process.platform === 'win32') {
      // For Windows:
      // - Use icon_badge.png for overlay (just the notification dot)
      if (isBadge) {
        const icon = nativeImage.createFromPath(getAssetPath('icon_badge.png'));
        if (!icon.isEmpty()) {
          mainWindow?.setOverlayIcon(icon, 'NeueNachrichten');
          mainWindow?.setIcon(getAssetPath('icon_badge_combined.png'));
          tray?.setImage(getAssetPath('tray-lowres_badge.png'));
        } else {
          console.log('Error creating overlay icon');
        }
      } else {
        mainWindow?.setOverlayIcon(null, 'Keine Nachrichten');
        mainWindow?.setIcon(getAssetPath('icon.png'));
        tray?.setImage(getAssetPath('tray-lowres.png'));
      }
    } else if (process.platform === 'darwin') {
      // For macOS
      if (isBadge) {
        const badgeIcon = nativeImage.createFromPath(getAssetPath('tray-lowres_badge.png')).resize({ width: 22, height: 22 });
        if (!badgeIcon.isEmpty()) {
          tray?.setImage(badgeIcon);
        }
      } else {
        const normalIcon = nativeImage.createFromPath(getAssetPath('tray-lowres.png')).resize({ width: 22, height: 22 });
        if (!normalIcon.isEmpty()) {
          tray?.setImage(normalIcon);
        }
      }
    } else {
      // For Linux and others
      if (isBadge) {
        tray?.setImage(getAssetPath('tray_badge.png'));
      } else {
        tray?.setImage(getAssetPath('tray.png'));
      }
    }
  } catch (error) {
    console.error('Error updating badge:', error);
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

ipcMain.handle('set-autostart', async (event, shouldAutostart) => {
  try {
    // We don't need to save the setting here as it's already saved by the saveSettings method
    // in SettingsContext.js. We just need to update the autostart in the system.
    
    // Update autostart in the system
    await updateAutostart();
    
    return { success: true };
  } catch (error) {
    console.error('[Autostart] Error setting autostart:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    await db.saveSettings(settings);
    updateAutostart();
    const newTheme = settings.theme || globalTheme;
    
    // Update minWidth if navbar zoom changed
    if (settings.navbarZoom && mainWindow) {
      const newMinWidth = calculateMinWidth(settings.navbarZoom);
      
      // Update the minimum size constraint
      mainWindow.setMinimumSize(newMinWidth, 700);
      
      // Get current window size
      const bounds = mainWindow.getBounds();
      
      // Only resize if current width is less than new minimum
      if (bounds.width < newMinWidth) {
        mainWindow.setBounds({
          ...bounds,
          width: newMinWidth
        });
      }
    }
    
    // Only update theme if it actually changed
    if (newTheme !== globalTheme) {
      globalTheme = newTheme;
      
      // Update all windows with the new theme
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((win) => {
        if (!win.isDestroyed() || win !== mainWindow) {
          // Send theme change event to all windows
          win.webContents.send('theme-changed', newTheme);
          
          // For child webview windows, also update the URL parameter
          const url = win.webContents.getURL();
          if (url.includes('webview.html')) {
            const urlObj = new URL(url);
            urlObj.searchParams.set('theme', newTheme);
            win.loadURL(urlObj.toString());
          }
        }
      });
    }
    
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
    
    // Update window minWidth when settings are loaded
    if (mainWindow && settings?.navbarZoom) {
      const newMinWidth = calculateMinWidth(settings.navbarZoom);
      
      // Update the minimum size constraint
      mainWindow.setMinimumSize(newMinWidth, 700);
      
      // Get current window size
      const bounds = mainWindow.getBounds();
      
      // Only resize if current width is less than new minimum
      if (bounds.width < newMinWidth) {
        mainWindow.setBounds({
          ...bounds,
          width: newMinWidth
        });
      }
    }
    
    return { success: true, settings: settings || {} };
  } catch (error) {
    console.error('Error getting settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-version', () => {
  return app.getVersion();
});

ipcMain.handle('reload-app', () => {
  if (mainWindow) {
    mainWindow.reload();
  }
  return { success: true };
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

ipcMain.handle('get-webview-preload-path', () => {
  return path.join(__dirname, 'webview-preload.js');
});

// ============================================================================
// WEBCONTENTSVIEW IPC HANDLERS (Modern replacement for deprecated BrowserView)
// ============================================================================

// Create a new WebContentsView
ipcMain.handle('browserview-create', async (event, { id, url, options = {} }) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    await webContentsViewManager.createWebContentsView(id, url, options);
    return { success: true };
  } catch (error) {
    console.error('[IPC] Error creating WebContentsView:', error);
    return { success: false, error: error.message };
  }
});

// Show a specific WebContentsView
ipcMain.handle('browserview-show', async (event, { id }) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    const success = await webContentsViewManager.showWebContentsView(id);
    return { success };
  } catch (error) {
    console.error('[IPC] Error showing WebContentsView:', error);
    return { success: false, error: error.message };
  }
});

// Hide the currently active WebContentsView
ipcMain.handle('browserview-hide', async (event) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    webContentsViewManager.hideActiveWebContentsView();
    return { success: true };
  } catch (error) {
    console.error('[IPC] Error hiding WebContentsView:', error);
    return { success: false, error: error.message };
  }
});

// Navigate a WebContentsView to a new URL
ipcMain.handle('browserview-navigate', async (event, { id, url }) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    const success = await webContentsViewManager.navigateWebContentsView(id, url);
    return { success };
  } catch (error) {
    console.error('[IPC] Error navigating WebContentsView:', error);
    return { success: false, error: error.message };
  }
});

// Reload a specific WebContentsView
ipcMain.handle('browserview-reload', async (event, { id }) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    const success = webContentsViewManager.reloadWebContentsView(id);
    return { success };
  } catch (error) {
    console.error('[IPC] Error reloading WebContentsView:', error);
    return { success: false, error: error.message };
  }
});

// Execute JavaScript in a WebContentsView
ipcMain.handle('browserview-execute-js', async (event, { id, code }) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    const result = await webContentsViewManager.executeJavaScript(id, code);
    return { success: true, result };
  } catch (error) {
    console.error('[IPC] Error executing JavaScript in WebContentsView:', error);
    return { success: false, error: error.message };
  }
});

// Get the current URL of a WebContentsView
ipcMain.handle('browserview-get-url', async (event, { id }) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    const url = webContentsViewManager.getWebContentsViewURL(id);
    return { success: true, url };
  } catch (error) {
    console.error('[IPC] Error getting WebContentsView URL:', error);
    return { success: false, error: error.message };
  }
});

// Initialize standard apps as WebContentsViews
ipcMain.handle('browserview-init-standard-apps', async (event, { standardApps }) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    await webContentsViewManager.initializeStandardApps(standardApps);
    return { success: true };
  } catch (error) {
    console.error('[IPC] Error initializing standard apps:', error);
    return { success: false, error: error.message };
  }
});

// Destroy a specific WebContentsView
ipcMain.handle('browserview-destroy', async (event, { id }) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    const success = webContentsViewManager.destroyWebContentsView(id);
    return { success };
  } catch (error) {
    console.error('[IPC] Error destroying WebContentsView:', error);
    return { success: false, error: error.message };
  }
});

// Get WebContentsViewManager statistics
ipcMain.handle('browserview-get-stats', async (event) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    const stats = webContentsViewManager.getStats();
    return { success: true, stats };
  } catch (error) {
    console.error('[IPC] Error getting WebContentsView stats:', error);
    return { success: false, error: error.message };
  }
});

// Set sidebar state for WebContentsView bounds adjustment
ipcMain.handle('browserview-set-sidebar-state', async (event, { isOpen }) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    webContentsViewManager.setSidebarState(isOpen);
    return { success: true };
  } catch (error) {
    console.error('[IPC] Error setting sidebar state:', error);
    return { success: false, error: error.message };
  }
});

// Get current sidebar state
ipcMain.handle('browserview-get-sidebar-state', async (event) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    const isOpen = webContentsViewManager.getSidebarState();
    return { success: true, isOpen };
  } catch (error) {
    console.error('[IPC] Error getting sidebar state:', error);
    return { success: false, error: error.message };
  }
});

// Handle WebContentsView messages (from preload script)
ipcMain.on('webcontentsview-message', (event, message) => {
  console.log('[WebContentsView Message]', message);
  
  // Forward debug keyboard events to main window for debug tool
  if (message.type === 'debug-keyboard-event') {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('webcontentsview-message', message);
    }
  }
});

// Backward compatibility: Handle old BrowserView messages
ipcMain.on('browserview-message', (event, message) => {
  console.log('[BrowserView Message - Backward Compatibility]', message);
  
  // Forward to new handler
  if (message.type === 'debug-keyboard-event') {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('webcontentsview-message', message);
    }
  }
});

// Handle keyboard shortcuts from BrowserViews (updated to handle BrowserView shortcuts)
ipcMain.on('keyboard-shortcut', (event, shortcutData) => {
  const { action, key, ctrlKey, altKey, shiftKey, metaKey, url, browserViewId } = shortcutData;
  
  // Get the BrowserView that sent the shortcut
  const senderWebContents = event.sender;
  
  try {
    // Handle WebContentsView-specific shortcuts
    if (action.startsWith('browserview-')) {
      if (!webContentsViewManager) {
        console.error('[Keyboard Shortcut] WebContentsViewManager not initialized');
        return;
      }
      
      const view = webContentsViewManager.getActiveWebContentsView();
      if (!view) {
        console.error('[Keyboard Shortcut] No active WebContentsView found');
        return;
      }
      
      switch (action) {
        case 'browserview-refresh':
          view.webContents.reload();
          break;
          
        case 'browserview-back':
          if (view.webContents.canGoBack()) {
            view.webContents.goBack();
          }
          break;
          
        case 'browserview-forward':
          if (view.webContents.canGoForward()) {
            view.webContents.goForward();
          }
          break;
          
        case 'browserview-print':
          view.webContents.print();
          break;
          
        case 'browserview-find':
          // Send find command to the BrowserView
          view.webContents.executeJavaScript(`
            if (window.find) {
              const searchTerm = prompt('Suchen nach:');
              if (searchTerm) {
                window.find(searchTerm);
              }
            }
          `);
          break;
          
        case 'browserview-zoom-in':
          view.webContents.getZoomFactor().then(currentZoom => {
            const newZoom = Math.min(currentZoom + 0.1, 2.0);
            view.webContents.setZoomFactor(newZoom);
          });
          break;
          
        case 'browserview-zoom-out':
          view.webContents.getZoomFactor().then(currentZoom => {
            const newZoom = Math.max(currentZoom - 0.1, 0.5);
            view.webContents.setZoomFactor(newZoom);
          });
          break;
          
        case 'browserview-zoom-reset':
          view.webContents.setZoomFactor(1.0);
          break;
          
        default:
          console.log(`[Keyboard Shortcut] Unknown BrowserView action: ${action}`);
      }
      return;
    }
    
    // Handle global shortcuts that should be forwarded to main window
    switch (action) {
      case 'close-modal':
        // Forward to main window to handle modal/drawer closing
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-shortcut', { action: 'close-modal' });
        }
        break;
        
      case 'command-palette':
        // Forward command palette shortcut to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'command-palette' });
        }
        break;
        
      case 'toggle-todo':
        // Forward todo toggle shortcut to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'toggle-todo' });
        }
        break;
        
      case 'toggle-secure-docs':
        // Forward secure docs toggle shortcut to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'toggle-secure-docs' });
        }
        break;
        
      case 'open-settings':
        // Forward settings shortcut to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'open-settings' });
        }
        break;
        
      case 'reload-current':
        // Forward reload current shortcut to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'reload-current' });
        }
        break;
        
      case 'reload-all':
        // Forward reload all shortcut to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'reload-all' });
        }
        break;
        
      case 'toggle-fullscreen':
        // Forward fullscreen toggle shortcut to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'toggle-fullscreen' });
        }
        break;
        
      // Handle navigation shortcuts (Ctrl+1-9)
      case 'nav-app-1':
      case 'nav-app-2':
      case 'nav-app-3':
      case 'nav-app-4':
      case 'nav-app-5':
      case 'nav-app-6':
      case 'nav-app-7':
      case 'nav-app-8':
      case 'nav-app-9':
        // Forward navigation shortcuts to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: action });
        }
        break;
        
      default:
        console.log(`[Keyboard Shortcut] Unknown action: ${action}`);
        // Forward unknown shortcuts to main window for handling
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('shortcut-triggered', { action, shortcut: shortcutData });
        }
    }
  } catch (error) {
    console.error(`[Keyboard Shortcut] Error handling ${action}:`, error);
  }
});

// Handle credential injection requests from BrowserViews
ipcMain.on('credential-request', async (event, data) => {
  const { service, browserViewId } = data;
  
  try {
    console.log(`[Credential Request] Service: ${service}, BrowserView: ${browserViewId}`);
    
    // Get all required credentials using keytar directly (we're in main process)
    const [emailResult, passwordResult, bbbPasswordResult, webuntisEmailResult, webuntisPasswordResult] = await Promise.all([
      keytar.getPassword('bbzcloud', 'email').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
      keytar.getPassword('bbzcloud', 'password').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
      keytar.getPassword('bbzcloud', 'bbbPassword').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
      keytar.getPassword('bbzcloud', 'webuntisEmail').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
      keytar.getPassword('bbzcloud', 'webuntisPassword').then(password => ({ success: !!password, password })).catch(() => ({ success: false }))
    ]);
    
    const credentials = {
      email: emailResult.success ? emailResult.password : null,
      password: passwordResult.success ? passwordResult.password : null,
      bbbPassword: bbbPasswordResult.success ? bbbPasswordResult.password : null,
      webuntisEmail: webuntisEmailResult.success ? webuntisEmailResult.password : null,
      webuntisPassword: webuntisPasswordResult.success ? webuntisPasswordResult.password : null
    };
    
    // Send credentials to the requesting BrowserView
    event.sender.send('inject-credentials', {
      service,
      credentials,
      browserViewId
    });
    
  } catch (error) {
    console.error('[Credential Request] Error:', error);
    event.sender.send('credential-response', {
      service,
      success: false,
      error: error.message,
      browserViewId
    });
  }
});

// Handle credential injection responses from BrowserViews
ipcMain.on('credential-response', (event, data) => {
  const { service, success, browserViewId, webContentsViewId } = data;
  console.log(`[Credential Response] Service: ${service}, Success: ${success}, View: ${browserViewId || webContentsViewId}`);
  
  // Optionally notify the renderer about credential injection results
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('credential-injection-result', {
      service,
      success,
      browserViewId: browserViewId || webContentsViewId
    });
  }
});

// ============================================================================
// WEBCONTENTSVIEW CREDENTIAL INJECTION HANDLERS
// ============================================================================

// Handle credential injection requests from WebContentsViews (new secure system)
ipcMain.on('credential-request', async (event, data) => {
  const { service, webContentsViewId } = data;
  
  try {
    console.log(`[WebContentsView Credential Request] Service: ${service}, WebContentsView: ${webContentsViewId}`);
    
    // Get all required credentials using keytar directly (we're in main process)
    const [emailResult, passwordResult, bbbPasswordResult, webuntisEmailResult, webuntisPasswordResult] = await Promise.all([
      keytar.getPassword('bbzcloud', 'email').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
      keytar.getPassword('bbzcloud', 'password').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
      keytar.getPassword('bbzcloud', 'bbbPassword').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
      keytar.getPassword('bbzcloud', 'webuntisEmail').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
      keytar.getPassword('bbzcloud', 'webuntisPassword').then(password => ({ success: !!password, password })).catch(() => ({ success: false }))
    ]);
    
    const credentials = {
      email: emailResult.success ? emailResult.password : null,
      password: passwordResult.success ? passwordResult.password : null,
      bbbPassword: bbbPasswordResult.success ? bbbPasswordResult.password : null,
      webuntisEmail: webuntisEmailResult.success ? webuntisEmailResult.password : null,
      webuntisPassword: webuntisPasswordResult.success ? webuntisPasswordResult.password : null
    };
    
    // Send credentials to the requesting WebContentsView
    event.sender.send('inject-credentials', {
      service,
      credentials,
      webContentsViewId
    });
    
  } catch (error) {
    console.error('[WebContentsView Credential Request] Error:', error);
    event.sender.send('credential-response', {
      service,
      success: false,
      error: error.message,
      webContentsViewId
    });
  }
});

// Handle automatic credential injection trigger (called from main process)
async function triggerCredentialInjection(webContentsViewId, service) {
  try {
    if (!webContentsViewManager) {
      console.error('[Credential Injection] WebContentsViewManager not initialized');
      return;
    }
    
    const view = webContentsViewManager.getWebContentsView(webContentsViewId);
    if (!view) {
      console.error(`[Credential Injection] WebContentsView ${webContentsViewId} not found`);
      return;
    }
    
    console.log(`[Credential Injection] Triggering injection for ${service} in ${webContentsViewId}`);
    
    // Get credentials from keytar
    const [emailResult, passwordResult, bbbPasswordResult, webuntisEmailResult, webuntisPasswordResult] = await Promise.all([
      keytar.getPassword('bbzcloud', 'email').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
      keytar.getPassword('bbzcloud', 'password').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
      keytar.getPassword('bbzcloud', 'bbbPassword').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
      keytar.getPassword('bbzcloud', 'webuntisEmail').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
      keytar.getPassword('bbzcloud', 'webuntisPassword').then(password => ({ success: !!password, password })).catch(() => ({ success: false }))
    ]);
    
    const credentials = {
      email: emailResult.success ? emailResult.password : null,
      password: passwordResult.success ? passwordResult.password : null,
      bbbPassword: bbbPasswordResult.success ? bbbPasswordResult.password : null,
      webuntisEmail: webuntisEmailResult.success ? webuntisEmailResult.password : null,
      webuntisPassword: webuntisPasswordResult.success ? webuntisPasswordResult.password : null
    };
    
    // Check if we have the required credentials
    if (!credentials.email || !credentials.password) {
      console.warn(`[Credential Injection] Missing basic credentials for ${service}`);
      return;
    }
    
    // Send credentials directly to the WebContentsView
    view.webContents.send('inject-credentials', {
      service,
      credentials,
      webContentsViewId
    });
    
  } catch (error) {
    console.error(`[Credential Injection] Error triggering injection for ${service}:`, error);
  }
}

// IPC handler to trigger credential injection from renderer
ipcMain.handle('trigger-credential-injection', async (event, { webContentsViewId, service }) => {
  try {
    await triggerCredentialInjection(webContentsViewId, service);
    return { success: true };
  } catch (error) {
    console.error('[IPC] Error triggering credential injection:', error);
    return { success: false, error: error.message };
  }
});

autoUpdater.on('checking-for-update', () => {
  mainWindow.webContents.send('update-status', 'Suche nach Updates...');
});

autoUpdater.on('update-available', (info) => {
  const currentVersion = app.getVersion();
  if (info.version !== currentVersion) {
    mainWindow.webContents.send('update-status', `Update verfügbar: Version ${info.version}`);
  }
});

autoUpdater.on('update-not-available', (info) => {
  // Don't send any status message when no update is available
  mainWindow.webContents.send('update-status', '');
});

autoUpdater.on('error', (err) => {
  mainWindow.webContents.send('update-status', 'Fehler beim Auto-Update.');
});

autoUpdater.on('download-progress', (progressObj) => {
  mainWindow.webContents.send('update-status', `Download läuft... ${Math.floor(progressObj.percent)}%`);
});

autoUpdater.on('update-downloaded', (info) => {
  mainWindow.webContents.send('update-status', 'Update heruntergeladen. Installation beim nächsten Neustart.');
});

// Handle update installation
ipcMain.handle('install-update', async () => {
  await prepareForUpdate();
  // isSilent = false (show installation progress)
  // isForceRunAfter = true (ensure app restarts after update)
  autoUpdater.quitAndInstall(false, true);
});

// Handle context menu events from webviews
ipcMain.on('showContextMenu', (event, data) => {
  const menu = createContextMenu(event.sender, data.selectionText);
  menu.popup();
});

// Handle webview messages
ipcMain.on('webview-message', (event, message) => {
  console.log('[WebView Debug]', message);
  
  // Forward debug keyboard events to main window for debug tool
  if (message.type === 'debug-keyboard-event') {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('webview-message', message);
    }
  }
});

// Global shortcut management
const registeredShortcuts = new Map();

// Handle keyboard shortcuts from webviews
ipcMain.on('keyboard-shortcut', (event, shortcutData) => {
  const { action, key, ctrlKey, altKey, shiftKey, metaKey, url } = shortcutData;
  
  // Get the webview that sent the shortcut
  const senderWebContents = event.sender;
  
  try {
    switch (action) {
      case 'webview-refresh':
        senderWebContents.reload();
        break;
        
      case 'webview-back':
        if (senderWebContents.canGoBack()) {
          senderWebContents.goBack();
        }
        break;
        
      case 'webview-forward':
        if (senderWebContents.canGoForward()) {
          senderWebContents.goForward();
        }
        break;
        
      case 'webview-print':
        senderWebContents.print();
        break;
        
      case 'webview-find':
        // Send find command to the webview
        senderWebContents.executeJavaScript(`
          if (window.find) {
            const searchTerm = prompt('Suchen nach:');
            if (searchTerm) {
              window.find(searchTerm);
            }
          }
        `);
        break;
        
      case 'webview-zoom-in':
        senderWebContents.getZoomFactor().then(currentZoom => {
          const newZoom = Math.min(currentZoom + 0.1, 2.0);
          senderWebContents.setZoomFactor(newZoom);
        });
        break;
        
      case 'webview-zoom-out':
        senderWebContents.getZoomFactor().then(currentZoom => {
          const newZoom = Math.max(currentZoom - 0.1, 0.5);
          senderWebContents.setZoomFactor(newZoom);
        });
        break;
        
      case 'webview-zoom-reset':
        senderWebContents.setZoomFactor(1.0);
        break;
        
      case 'close-modal':
        // Forward to main window to handle modal/drawer closing
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-shortcut', { action: 'close-modal' });
        }
        break;
        
      case 'command-palette':
        // Forward command palette shortcut to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'command-palette' });
        }
        break;
        
      case 'toggle-todo':
        // Forward todo toggle shortcut to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'toggle-todo' });
        }
        break;
        
      case 'toggle-secure-docs':
        // Forward secure docs toggle shortcut to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'toggle-secure-docs' });
        }
        break;
        
      case 'open-settings':
        // Forward settings shortcut to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'open-settings' });
        }
        break;
        
      // Add missing shortcut handlers
      case 'reload-current':
        // Forward reload current shortcut to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'reload-current' });
        }
        break;
        
      case 'reload-all':
        // Forward reload all shortcut to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'reload-all' });
        }
        break;
        
      case 'toggle-fullscreen':
        // Forward fullscreen toggle shortcut to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'toggle-fullscreen' });
        }
        break;
        
      // Handle navigation shortcuts (Ctrl+1-9)
      case 'nav-app-1':
      case 'nav-app-2':
      case 'nav-app-3':
      case 'nav-app-4':
      case 'nav-app-5':
      case 'nav-app-6':
      case 'nav-app-7':
      case 'nav-app-8':
      case 'nav-app-9':
        // Forward navigation shortcuts to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: action });
        }
        break;
        
      default:
        console.log(`[Keyboard Shortcut] Unknown action: ${action}`);
        // Forward unknown shortcuts to main window for handling
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('shortcut-triggered', { action, shortcut: shortcutData });
        }
    }
  } catch (error) {
    console.error(`[Keyboard Shortcut] Error handling ${action}:`, error);
  }
});

// Global shortcut registration
ipcMain.handle('register-global-shortcut', async (event, { shortcut }) => {
  try {
    if (registeredShortcuts.has(shortcut)) {
      console.log(`[Global Shortcut] Shortcut ${shortcut} already registered`);
      return true;
    }

    const success = globalShortcut.register(shortcut, () => {
      console.log(`[Global Shortcut] Triggered: ${shortcut}`);
      
      // Send to main window
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('shortcut-triggered', { action: shortcut, shortcut });
      }
      
      // Also send to the requesting webview if available
      const senderWebContents = event.sender;
      if (senderWebContents && !senderWebContents.isDestroyed()) {
        senderWebContents.send(`global-shortcut-${shortcut}`);
      }
    });

    if (success) {
      registeredShortcuts.set(shortcut, true);
      console.log(`[Global Shortcut] Successfully registered: ${shortcut}`);
    } else {
      console.warn(`[Global Shortcut] Failed to register: ${shortcut}`);
    }

    return success;
  } catch (error) {
    console.error(`[Global Shortcut] Error registering ${shortcut}:`, error);
    return false;
  }
});

// Global shortcut unregistration
ipcMain.handle('unregister-global-shortcut', async (event, { shortcut }) => {
  try {
    if (!registeredShortcuts.has(shortcut)) {
      console.log(`[Global Shortcut] Shortcut ${shortcut} not registered`);
      return true;
    }

    globalShortcut.unregister(shortcut);
    registeredShortcuts.delete(shortcut);
    console.log(`[Global Shortcut] Successfully unregistered: ${shortcut}`);
    return true;
  } catch (error) {
    console.error(`[Global Shortcut] Error unregistering ${shortcut}:`, error);
    return false;
  }
});

// Unregister all global shortcuts
ipcMain.handle('unregister-all-global-shortcuts', async () => {
  try {
    globalShortcut.unregisterAll();
    registeredShortcuts.clear();
    console.log('[Global Shortcut] All shortcuts unregistered');
    return true;
  } catch (error) {
    console.error('[Global Shortcut] Error unregistering all shortcuts:', error);
    return false;
  }
});

// Global dialog state
let isShowingDialog = false;

app.on('web-contents-created', (event, contents) => {
  // Only enable dev tools in development
  if (contents.getType() === 'webview' && isDev) {
    contents.on('dom-ready', () => {
      contents.openDevTools();
    });
  }

  // Set up download handler for this web contents
  contents.session.on('will-download', (event, item) => {
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

    item.once('done', async (event, state) => {
      if (state === 'completed') {
        mainWindow.webContents.send('download', 'completed');
        
        // Only show dialog if no other dialog is showing
        if (!isShowingDialog) {
          isShowingDialog = true;
          
          try {
            const response = await dialog.showMessageBox(mainWindow, {
              type: 'info',
              buttons: ['Ok', 'Datei öffnen', 'Ordner öffnen'],
              title: 'Download',
              message: 'Download abgeschlossen',
              noLink: true,
              modal: true,
              defaultId: 0,
              cancelId: 0
            });
            
            if (response.response === 1) {
              shell.openPath(item.getSavePath());
            } else if (response.response === 2) {
              shell.openPath(path.dirname(item.getSavePath()));
            }
          } catch (error) {
            console.error('Error showing download dialog:', error);
          } finally {
            isShowingDialog = false;
          }
        }
      } else {
        mainWindow.webContents.send('download', 'failed');
      }
    });
  });

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

  // Handle all new windows with our webview wrapper
  if (!url.includes('about:blank')) {
    // Create window with the same session
    createWebviewWindow(url, 'BBZCloud');
    return { action: 'deny' };
  }

    return { action: 'allow' };
  });

});

Menu.setApplicationMenu(null);

app.on('before-quit', async () => {
  app.isQuitting = true;
  if (mainWindow) {
    saveWindowState();
  }
  
  // Clear update check interval
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
  }
  
  // Check if we have a downloaded update and install it
  if (autoUpdater.getFeedURL() && autoUpdater.updateDownloaded) {
    await prepareForUpdate();
    autoUpdater.quitAndInstall(false, true);
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
    const password = await keytar.getPassword('bbzcloud', 'password');
    if (!password) {
      return { 
        success: false, 
        error: 'Bitte richten Sie zuerst ein Passwort in den Einstellungen ein.'
      };
    }
    return { success: true };
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
  let updateTimeout = null;
  let isProcessing = false;
  
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
    
    // Register temp file for cleanup tracking
    db.registerTempFile(tempPath);
    
    // Open file with default application
    shell.openPath(tempPath);
    
    // Function to handle file updates with debouncing
    const handleFileUpdate = async () => {
      if (isProcessing) return;
      
      try {
        isProcessing = true;
        
        // Add a delay to ensure the file is completely written
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Check if file still exists before reading
        if (!fs.existsSync(tempPath)) {
          isProcessing = false;
          return;
        }
        
        try {
          // Read the updated content
          const updatedContent = await fs.readFile(tempPath);
          
          // Compress the content
          const compressedContent = await compress(updatedContent);
          
          // Update the document with the same compression flag as before
          const updatedDocument = {
            ...document,
            content: compressedContent,
            compressed: true, // Always use compression for consistency
            size: `${(updatedContent.length / 1024).toFixed(2)} KB`, // Update size
            date: new Date().toISOString()
          };
          
          // Save the updated document
          await db.saveSecureDocument(updatedDocument, password);
          
          // Notify frontend of file update
          mainWindow?.webContents.send('secure-file-updated');
        } catch (readError) {
          console.error('Error reading or processing updated file:', readError);
          // If there's an error reading or processing the file, try again after a delay
          setTimeout(() => {
            isProcessing = false;
          }, 1000);
          return;
        }
      } catch (error) {
        console.error('Error updating encrypted file:', error);
      } finally {
        isProcessing = false;
      }
    };
    
    // Watch for changes with debouncing
    watcher = fs.watch(tempPath, (eventType) => {
      if (eventType === 'change') {
        // Clear any existing timeout
        if (updateTimeout) {
          clearTimeout(updateTimeout);
        }
        
        // Set a new timeout to handle the update
        updateTimeout = setTimeout(handleFileUpdate, 300);
      }
    });
    
    // Register watcher for cleanup tracking
    db.registerFileWatcher(`secure-file-${fileId}`, watcher);
    
    // Clean up resources when app quits
    const cleanup = async () => {
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      
      if (watcher) {
        watcher.close();
      }
      
      if (tempPath && fs.existsSync(tempPath)) {
        try {
          await secureDelete(tempPath);
        } catch (error) {
          console.error('Error deleting temp file:', error);
        }
      }
    };
    
    // Add cleanup handler for app quit
    app.on('before-quit', cleanup);
    
    return { success: true };
  } catch (error) {
    if (updateTimeout) {
      clearTimeout(updateTimeout);
    }
    
    if (watcher) {
      watcher.close();
    }
    
    if (tempPath && fs.existsSync(tempPath)) {
      try {
        await secureDelete(tempPath);
      } catch (deleteError) {
        console.error('Error deleting temp file:', deleteError);
      }
    }
    
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
    createTray();
    createSplashWindow();
    await createWindow();
    
    // Update autostart AFTER window is created and database is fully initialized
    // Add a small delay to ensure everything is ready
    setTimeout(async () => {
      try {
        await updateAutostart();
        console.log('[Autostart] Autostart setup completed after app initialization');
      } catch (error) {
        console.error('[Autostart] Error during delayed autostart setup:', error);
      }
    }, 2000);
    
    // Initial update check
    autoUpdater.checkForUpdatesAndNotify();
    
    // Set up periodic update check (every 15 minutes)
    updateCheckTimer = setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, UPDATE_CHECK_INTERVAL);

    // Handle startup arguments
    const startMinimized = process.argv.includes('--minimized');
    if (startMinimized && mainWindow) {
      mainWindow.minimize();
    }
  } catch (error) {
    console.error('Error during app initialization:', error);
  }

  // Handle system resume and display change events
  powerMonitor.on('resume', async () => {
    // Check and adjust main window position
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      const newBounds = ensureWindowBoundsVisible(bounds);
      if (newBounds !== bounds) {
        mainWindow.setBounds(newBounds);
      }

      // Only handle specific webviews that need session clearing
      const webviews = webContents.getAllWebContents().filter(wc => 
        wc.getType() === 'webview' && 
        (wc.getURL().includes('exchange.bbz-rd-eck.de/owa') || wc.getURL().includes('webuntis.com'))
      );

      // Clear sessions only for Outlook and WebUntis
      for (const webview of webviews) {
        try {
          const url = webview.getURL();
          if (url.includes('exchange.bbz-rd-eck.de/owa')) {
            await webview.loadURL('https://exchange.bbz-rd-eck.de/owa/');
          } else if (url.includes('webuntis.com')) {
            await webview.loadURL('https://neilo.webuntis.com/WebUntis/?school=bbz-rd-eck#/basic/login');
          }
        } catch (error) {
          console.error('Error handling webview session:', error);
        }
      }

      // Notify about all reloads
      mainWindow.webContents.send('system-resumed', webviewsToReload);
    }

    // Check and adjust all webview windows
    windowRegistry.forEach((win) => {
      if (!win.isDestroyed()) {
        const bounds = win.getBounds();
        const newBounds = ensureWindowBoundsVisible(bounds);
        if (newBounds !== bounds) {
          win.setBounds(newBounds);
        }
      }
    });
  });

  powerMonitor.on('unlock-screen', () => {
    // Check and adjust main window position
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      const newBounds = ensureWindowBoundsVisible(bounds);
      if (newBounds !== bounds) {
        mainWindow.setBounds(newBounds);
      }
      mainWindow.webContents.send('system-resumed', webviewsToReload);
    }

    // Check and adjust all webview windows
    windowRegistry.forEach((win) => {
      if (!win.isDestroyed()) {
        const bounds = win.getBounds();
        const newBounds = ensureWindowBoundsVisible(bounds);
        if (newBounds !== bounds) {
          win.setBounds(newBounds);
        }
      }
    });
  });

  // Handle display changes (monitor connect/disconnect)
  screen.on('display-added', () => {
    // Check and adjust main window position
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      const newBounds = ensureWindowBoundsVisible(bounds);
      if (newBounds !== bounds) {
        mainWindow.setBounds(newBounds);
      }
    }

    // Check and adjust all webview windows
    windowRegistry.forEach((win) => {
      if (!win.isDestroyed()) {
        const bounds = win.getBounds();
        const newBounds = ensureWindowBoundsVisible(bounds);
        if (newBounds !== bounds) {
          win.setBounds(newBounds);
        }
      }
    });
  });

  screen.on('display-removed', () => {
    // Check and adjust main window position
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      const newBounds = ensureWindowBoundsVisible(bounds);
      if (newBounds !== bounds) {
        mainWindow.setBounds(newBounds);
      }
    }

    // Check and adjust all webview windows
    windowRegistry.forEach((win) => {
      if (!win.isDestroyed()) {
        const bounds = win.getBounds();
        const newBounds = ensureWindowBoundsVisible(bounds);
        if (newBounds !== bounds) {
          win.setBounds(newBounds);
        }
      }
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================================================
// WEBCONTENTSVIEW IPC HANDLERS (Additional handlers for BrowserViewController compatibility)
// ============================================================================

// Additional WebContentsView handlers that BrowserViewController expects
ipcMain.handle('initStandardAppsWebContentsViews', async (event, standardApps) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    await webContentsViewManager.initializeStandardApps(standardApps);
    return { success: true };
  } catch (error) {
    console.error('[IPC] Error initializing standard apps as WebContentsViews:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('showWebContentsView', async (event, id) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    const success = await webContentsViewManager.showWebContentsView(id);
    return { success };
  } catch (error) {
    console.error('[IPC] Error showing WebContentsView:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('createWebContentsView', async (event, id, url, options = {}) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    await webContentsViewManager.createWebContentsView(id, url, options);
    return { success: true };
  } catch (error) {
    console.error('[IPC] Error creating WebContentsView:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('getWebContentsViewURL', async (event, id) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    const url = webContentsViewManager.getWebContentsViewURL(id);
    return { success: true, url };
  } catch (error) {
    console.error('[IPC] Error getting WebContentsView URL:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('reloadWebContentsView', async (event, id) => {
  try {
    if (!webContentsViewManager) {
      throw new Error('WebContentsViewManager not initialized');
    }
    
    const success = webContentsViewManager.reloadWebContentsView(id);
    return { success };
  } catch (error) {
    console.error('[IPC] Error reloading WebContentsView:', error);
    return { success: false, error: error.message };
  }
});

// Handle zoom factor changes
ipcMain.handle('set-zoom-factor', async (event, { webContentsId, zoomFactor }) => {
  try {
    const contents = webContents.fromId(webContentsId);
    if (contents) {
      await contents.setZoomFactor(zoomFactor);
      return { success: true };
    }
    return { success: false, error: 'WebContents not found' };
  } catch (error) {
    console.error('Error setting zoom factor:', error);
    return { success: false, error: error.message };
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
