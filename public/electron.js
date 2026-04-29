const { app, BrowserWindow, ipcMain, shell, nativeImage, Menu, Tray, dialog, webContents, powerMonitor, screen, globalShortcut, powerSaveBlocker, session } = require('electron');
const path = require('path');
const zlib = require('zlib');
const util = require('util');
const crypto = require('crypto');
const compress = util.promisify(zlib.gzip);
const decompress = util.promisify(zlib.gunzip);

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

// Track sessions that already have the will-download handler to prevent duplicates.
const downloadHandlerSessions = new WeakSet();

// Central registry for secure-file cleanup handlers.
// Using a Set ensures each handler is only registered once and allows removal.
const secureFileCleanups = new Set();
app.on('before-quit', () => {
  secureFileCleanups.forEach(fn => fn());
  secureFileCleanups.clear();
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
let shouldStartMinimized = false;
let globalTheme = 'light';

// Badge update function (shared between IPC and event-driven title updates)
function updateBadge(badgeValue) {
  try {
    const count = typeof badgeValue === 'number' ? badgeValue : (badgeValue ? 1 : 0);
    const hasBadge = count > 0;

    if (process.platform === 'win32') {
      if (hasBadge) {
        const icon = nativeImage.createFromPath(getAssetPath('icon_badge.png'));
        if (!icon.isEmpty()) {
          mainWindow?.setOverlayIcon(icon, `${count} ungelesene Nachricht${count !== 1 ? 'en' : ''}`);
          mainWindow?.setIcon(getAssetPath('icon_badge_combined.png'));
          tray?.setImage(getAssetPath('tray-lowres_badge.png'));
        }
      } else {
        mainWindow?.setOverlayIcon(null, 'Keine Nachrichten');
        mainWindow?.setIcon(getAssetPath('icon.png'));
        tray?.setImage(getAssetPath('tray-lowres.png'));
      }
    } else if (process.platform === 'darwin') {
      if (hasBadge) {
        app.dock?.setBadge(String(count));
        const badgeIcon = nativeImage.createFromPath(getAssetPath('tray-lowres_badge.png')).resize({ width: 22, height: 22 });
        if (!badgeIcon.isEmpty()) {
          tray?.setImage(badgeIcon);
        }
      } else {
        app.dock?.setBadge('');
        const normalIcon = nativeImage.createFromPath(getAssetPath('tray-lowres.png')).resize({ width: 22, height: 22 });
        if (!normalIcon.isEmpty()) {
          tray?.setImage(normalIcon);
        }
      }
    } else {
      if (hasBadge) {
        tray?.setImage(getAssetPath('tray_badge.png'));
      } else {
        tray?.setImage(getAssetPath('tray.png'));
      }
    }
  } catch (error) {
    console.error('Error updating badge:', error);
  }
}

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

// Parse --db-path command line argument BEFORE initializing DatabaseService
// so that the database is created/opened at the correct location
const dbPathArg = process.argv.find(arg => arg.startsWith('--db-path='));
if (dbPathArg) {
  const customDbPath = dbPathArg.split('=')[1];
  if (customDbPath) {
    try {
      const resolvedPath = path.resolve(customDbPath);
      store.set('databasePath', resolvedPath);
      console.log('[CLI] Database path set to:', resolvedPath);
    } catch (error) {
      console.error('[CLI] Error resolving database path:', error);
    }
  }
}

// Initialize database service
const db = new DatabaseService();

let mainWindow;
let splashWindow;
let tray;
const windowRegistry = new Map();

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

  // Listen for page-title-updated events from webviews (event-driven badge updates)
  // Only applies to BBZ Chat (schul.cloud uses favicon polling)
  mainWindow.webContents.on('did-attach-webview', (event, webContents) => {
    webContents.on('page-title-updated', (event, title, explicitSet) => {
      try {
        // Only handle BBZ Chat titles: "(N) BBZ Chat" or "BBZ Chat"
        if (!title || !title.includes('BBZ Chat')) return;
        const match = title.match(/^\((\d+)\)/);
        const unreadCount = match ? parseInt(match[1], 10) : 0;
        updateBadge(unreadCount);
      } catch (error) {
        console.error('Error handling page title update:', error);
      }
    });
  });

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

  // ============================================================================
  // KEYBOARD SHORTCUT HANDLING WITH before-input-event
  // ============================================================================
  
  /**
   * Handle keyboard shortcuts using before-input-event
   * This intercepts all keyboard events before they reach any webview,
   * allowing shortcuts to work even when focus is inside a webview
   */
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Only handle keyDown events
    if (input.type !== 'keyDown') {
      return;
    }

    const key = input.key.toLowerCase();
    const ctrl = input.control || input.meta; // Handle both Ctrl and Cmd (macOS)
    const alt = input.alt;
    const shift = input.shift;

    // Debug logging
    console.log('[Keyboard Shortcut] Key pressed:', {
      key,
      ctrl,
      alt,
      shift,
      raw: input.key
    });

    // Helper function to check if shortcut matches
    const matchesShortcut = (expectedKey, expectedCtrl = false, expectedAlt = false, expectedShift = false) => {
      return key === expectedKey && 
             !!ctrl === expectedCtrl && 
             !!alt === expectedAlt && 
             !!shift === expectedShift;
    };

    let handled = false;

    // Command Palette: Ctrl+Shift+P
    if (matchesShortcut('p', true, false, true)) {
      console.log('[Keyboard Shortcut] Matched: Command Palette');
      mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'command-palette' });
      handled = true;
    }
    
    // Toggle Todo: Ctrl+Shift+T
    else if (matchesShortcut('t', true, false, true)) {
      mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'toggle-todo' });
      handled = true;
    }
    
    // Toggle Secure Documents: Ctrl+D
    else if (matchesShortcut('d', true, false, false)) {
      mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'toggle-secure-docs' });
      handled = true;
    }
    
    // Open Settings: Ctrl+Comma
    else if (matchesShortcut(',', true, false, false)) {
      mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'open-settings' });
      handled = true;
    }
    
    // Reload Current: Ctrl+R
    else if (matchesShortcut('r', true, false, false)) {
      mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'reload-current' });
      handled = true;
    }
    
    // Reload All: Ctrl+Shift+R
    else if (matchesShortcut('r', true, false, true)) {
      mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'reload-all' });
      handled = true;
    }
    
    // Toggle Fullscreen: F11
    else if (matchesShortcut('f11', false, false, false)) {
      mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'toggle-fullscreen' });
      handled = true;
    }
    
    // Close Modal/Drawer: Escape
    else if (matchesShortcut('escape', false, false, false)) {
      mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'close-modal' });
      handled = true;
    }
    
    // Navigation shortcuts: Ctrl+1 through Ctrl+9
    else if (ctrl && !alt && !shift && key >= '1' && key <= '9') {
      mainWindow.webContents.send('webview-message', { 
        type: 'webview-shortcut', 
        action: `nav-app-${key}` 
      });
      handled = true;
    }
    
    // WebView-specific shortcuts (only when a webview has focus)
    else {
      // Check if focus is in a webview
      const focusedWebview = webContents.getFocusedWebContents();
      if (focusedWebview && focusedWebview !== mainWindow.webContents) {
        // WebView Refresh: F5
        if (matchesShortcut('f5', false, false, false)) {
          if (focusedWebview.reload) {
            focusedWebview.reload();
            handled = true;
          }
        }
        // WebView Back: Alt+Left
        else if (matchesShortcut('arrowleft', false, true, false)) {
          if (focusedWebview.canGoBack && focusedWebview.canGoBack()) {
            focusedWebview.goBack();
            handled = true;
          }
        }
        // WebView Forward: Alt+Right
        else if (matchesShortcut('arrowright', false, true, false)) {
          if (focusedWebview.canGoForward && focusedWebview.canGoForward()) {
            focusedWebview.goForward();
            handled = true;
          }
        }
        // WebView Print: Ctrl+P
        else if (matchesShortcut('p', true, false, false)) {
          if (focusedWebview.print) {
            focusedWebview.print();
            handled = true;
          }
        }
        // WebView Find: Ctrl+F
        else if (matchesShortcut('f', true, false, false)) {
          focusedWebview.executeJavaScript(`
            if (window.find) {
              const searchTerm = prompt('Suchen nach:');
              if (searchTerm) {
                window.find(searchTerm);
              }
            }
          `).catch(err => console.error('Error opening find dialog:', err));
          handled = true;
        }
        // WebView Zoom In: Ctrl+Plus or Ctrl+Equal
        else if (matchesShortcut('+', true, false, false) || matchesShortcut('=', true, false, false)) {
          const currentZoom = focusedWebview.getZoomFactor();
          const newZoom = Math.min(currentZoom + 0.1, 2.0);
          focusedWebview.setZoomFactor(newZoom);
          handled = true;
        }
        // WebView Zoom Out: Ctrl+Minus
        else if (matchesShortcut('-', true, false, false)) {
          const currentZoom = focusedWebview.getZoomFactor();
          const newZoom = Math.max(currentZoom - 0.1, 0.5);
          focusedWebview.setZoomFactor(newZoom);
          handled = true;
        }
        // WebView Zoom Reset: Ctrl+0
        else if (matchesShortcut('0', true, false, false)) {
          focusedWebview.setZoomFactor(1.0);
          handled = true;
        }
      }
    }

    // Prevent default behavior if we handled the shortcut
    if (handled) {
      event.preventDefault();
    }
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

function createContextMenu(webContents, selectedText, spellItems = []) {
  return Menu.buildFromTemplate([
    ...spellItems,
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

// Store active notification timeouts
const activeNotifications = new Map();

ipcMain.handle('schedule-notification', async (event, { title, body, when }) => {
  try {
    console.log('[Notification] Scheduling notification:', { title, body, when, currentTime: Date.now() });
    
    const delay = when - Date.now();
    
    // If the time is in the past or very close (within 1 minute), show immediately
    if (delay <= 60000) {
      console.log('[Notification] Showing notification immediately (past due or very soon)');
      const notification = new Notification({
        title,
        body,
        silent: false
      });
      notification.show();
      
      // Show notification action handlers
      notification.on('click', () => {
        // Bring main window to focus when notification is clicked
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
        }
      });
    } else {
      // Schedule for future
      console.log('[Notification] Scheduling for future:', `${Math.round(delay / 1000)}s from now`);
      
      const notificationId = `${title}-${when}`;
      
      // Clear any existing notification with the same ID
      if (activeNotifications.has(notificationId)) {
        clearTimeout(activeNotifications.get(notificationId));
      }
      
      const timeoutId = setTimeout(() => {
        console.log('[Notification] Showing scheduled notification:', title);
        const notification = new Notification({
          title,
          body,
          silent: false
        });
        notification.show();
        
        notification.on('click', () => {
          // Bring main window to focus when notification is clicked
          if (mainWindow) {
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
          }
        });
        
        // Clean up from active notifications map
        activeNotifications.delete(notificationId);
      }, delay);
      
      // Store the timeout ID for cleanup
      activeNotifications.set(notificationId, timeoutId);
    }

    return { success: true };
  } catch (error) {
    console.error('Error scheduling notification:', error);
    return { success: false, error: error.message };
  }
});

// Clean up notifications on app quit
app.on('before-quit', () => {
  console.log('[Notification] Cleaning up active notifications');
  activeNotifications.forEach((timeoutId) => {
    clearTimeout(timeoutId);
  });
  activeNotifications.clear();
});

ipcMain.handle('save-credentials', async (event, { service, account, password }) => {
  try {
    // Always save to keytar (primary storage)
    await keytar.setPassword(service, account, password);
    
    // Also save to database as encrypted fallback
    try {
      // If saving the password account, set it as encryption key first
      // so that subsequent credential saves in the same batch succeed
      if (account === 'password') {
        db.setEncryptionKey(password);
      }
      await db.saveCredential(service, account, password);
    } catch (dbError) {
      // Log but don't fail if DB save doesn't work (e.g. encryption key not set yet)
      console.warn('[Credentials] DB fallback save failed:', dbError.message);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error in save-credentials:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-credentials', async (event, { service, account }) => {
  try {
    // Delete from keytar
    await keytar.deletePassword(service, account);
    
    // Also delete from database fallback
    try {
      await db.deleteCredential(service, account);
    } catch (dbError) {
      console.warn('[Credentials] DB fallback delete failed:', dbError.message);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error in delete-credentials:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.on('update-badge', (event, badgeValue) => {
  updateBadge(badgeValue);
});

ipcMain.handle('get-credentials', async (event, { service, account }) => {
  try {
    // Try keytar first (primary storage)
    const password = await getCredentials(service, account);
    if (password) {
      return { success: true, password, fromDb: false };
    }
    
    // Fallback: try database
    try {
      const dbValue = await db.getCredential(service, account);
      if (dbValue) {
        return { success: true, password: dbValue, fromDb: true };
      }
    } catch (dbError) {
      console.warn('[Credentials] DB fallback read failed:', dbError.message);
    }
    
    return { success: true, password: null, fromDb: false };
  } catch (error) {
    console.error('Error in get-credentials:', error);
    return { success: false, error: error.message };
  }
});

// Check if database has stored credentials for a service
ipcMain.handle('has-db-credentials', async (event, { service }) => {
  try {
    const hasCreds = await db.hasCredentials(service);
    return { success: true, hasCredentials: hasCreds };
  } catch (error) {
    console.error('Error in has-db-credentials:', error);
    return { success: false, error: error.message, hasCredentials: false };
  }
});

// Set the database encryption key (used when keytar is empty and user enters password)
ipcMain.handle('set-db-encryption-key', async (event, { password }) => {
  try {
    db.setEncryptionKey(password);
    return { success: true };
  } catch (error) {
    console.error('Error in set-db-encryption-key:', error);
    return { success: false, error: error.message };
  }
});

// Restore all credentials from DB to keytar (used after successful DB decryption)
ipcMain.handle('restore-credentials-from-db', async (event, { service }) => {
  try {
    const creds = await db.getAllCredentials(service);
    const accounts = Object.keys(creds);
    
    for (const account of accounts) {
      await keytar.setPassword(service, account, creds[account]);
    }
    
    return { success: true, restoredCount: accounts.length };
  } catch (error) {
    console.error('Error in restore-credentials-from-db:', error);
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
        if (!win.isDestroyed() && win !== mainWindow) {
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

// Tracked via event since autoUpdater has no .updateDownloaded property
let updateDownloaded = false;

const sendUpdateStatus = (msg) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', msg);
  }
};

autoUpdater.on('checking-for-update', () => {
  sendUpdateStatus('Suche nach Updates...');
});

autoUpdater.on('update-available', (info) => {
  const currentVersion = app.getVersion();
  if (info.version !== currentVersion) {
    sendUpdateStatus(`Update verfügbar: Version ${info.version}`);
  }
});

autoUpdater.on('update-not-available', () => {
  sendUpdateStatus('');
});

autoUpdater.on('error', () => {
  sendUpdateStatus('Fehler beim Auto-Update.');
});

autoUpdater.on('download-progress', (progressObj) => {
  sendUpdateStatus(`Download läuft... ${Math.floor(progressObj.percent)}%`);
});

autoUpdater.on('update-downloaded', () => {
  updateDownloaded = true;
  sendUpdateStatus('Update heruntergeladen. Installation beim nächsten Neustart.');
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

// Global dialog state
let isShowingDialog = false;

app.on('web-contents-created', (event, contents) => {
  // Only enable dev tools in development
  if (contents.getType() === 'webview' && isDev) {
    contents.on('dom-ready', () => {
      contents.openDevTools();
    });
  }

  // Register keyboard shortcuts for webviews
  if (contents.getType() === 'webview') {
    contents.on('before-input-event', (event, input) => {
      // Only handle keyDown events
      if (input.type !== 'keyDown') {
        return;
      }

      const key = input.key.toLowerCase();
      const ctrl = input.control || input.meta;
      const alt = input.alt;
      const shift = input.shift;

      console.log('[Webview Keyboard] Key pressed:', {
        key,
        ctrl,
        alt,
        shift,
        webviewURL: contents.getURL()
      });

      // Helper function to check if shortcut matches
      const matchesShortcut = (expectedKey, expectedCtrl = false, expectedAlt = false, expectedShift = false) => {
        return key === expectedKey && 
               !!ctrl === expectedCtrl && 
               !!alt === expectedAlt && 
               !!shift === expectedShift;
      };

      let handled = false;

      // Command Palette: Ctrl+Shift+P
      if (matchesShortcut('p', true, false, true)) {
        console.log('[Webview Keyboard] Matched: Command Palette');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'command-palette' });
        }
        handled = true;
      }
      // Toggle Todo: Ctrl+Shift+T
      else if (matchesShortcut('t', true, false, true)) {
        console.log('[Webview Keyboard] Matched: Toggle Todo');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'toggle-todo' });
        }
        handled = true;
      }
      // Toggle Secure Documents: Ctrl+D
      else if (matchesShortcut('d', true, false, false)) {
        console.log('[Webview Keyboard] Matched: Toggle Secure Docs');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'toggle-secure-docs' });
        }
        handled = true;
      }
      // Open Settings: Ctrl+Comma
      else if (matchesShortcut(',', true, false, false)) {
        console.log('[Webview Keyboard] Matched: Open Settings');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'open-settings' });
        }
        handled = true;
      }
      // Reload Current: Ctrl+R
      else if (matchesShortcut('r', true, false, false)) {
        console.log('[Webview Keyboard] Matched: Reload Current');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'reload-current' });
        }
        handled = true;
      }
      // Reload All: Ctrl+Shift+R
      else if (matchesShortcut('r', true, false, true)) {
        console.log('[Webview Keyboard] Matched: Reload All');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'reload-all' });
        }
        handled = true;
      }
      // Toggle Fullscreen: F11
      else if (matchesShortcut('f11', false, false, false)) {
        console.log('[Webview Keyboard] Matched: Toggle Fullscreen');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'toggle-fullscreen' });
        }
        handled = true;
      }
      // Close Modal/Drawer: Escape
      else if (matchesShortcut('escape', false, false, false)) {
        console.log('[Webview Keyboard] Matched: Close Modal');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { type: 'webview-shortcut', action: 'close-modal' });
        }
        handled = true;
      }
      // Navigation shortcuts: Ctrl+1 through Ctrl+9
      else if (ctrl && !alt && !shift && key >= '1' && key <= '9') {
        console.log('[Webview Keyboard] Matched: Navigation Ctrl+' + key);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webview-message', { 
            type: 'webview-shortcut', 
            action: `nav-app-${key}` 
          });
        }
        handled = true;
      }
      // WebView Refresh: F5
      else if (matchesShortcut('f5', false, false, false)) {
        console.log('[Webview Keyboard] Matched: Refresh F5');
        contents.reload();
        handled = true;
      }
      // WebView Back: Alt+Left
      else if (matchesShortcut('arrowleft', false, true, false)) {
        console.log('[Webview Keyboard] Matched: Back Alt+Left');
        if (contents.canGoBack()) {
          contents.goBack();
        }
        handled = true;
      }
      // WebView Forward: Alt+Right
      else if (matchesShortcut('arrowright', false, true, false)) {
        console.log('[Webview Keyboard] Matched: Forward Alt+Right');
        if (contents.canGoForward()) {
          contents.goForward();
        }
        handled = true;
      }
      // WebView Print: Ctrl+P
      else if (matchesShortcut('p', true, false, false)) {
        console.log('[Webview Keyboard] Matched: Print Ctrl+P');
        contents.print();
        handled = true;
      }
      // WebView Find: Ctrl+F
      else if (matchesShortcut('f', true, false, false)) {
        console.log('[Webview Keyboard] Matched: Find Ctrl+F');
        contents.executeJavaScript(`
          if (window.find) {
            const searchTerm = prompt('Suchen nach:');
            if (searchTerm) {
              window.find(searchTerm);
            }
          }
        `).catch(err => console.error('Error opening find dialog:', err));
        handled = true;
      }
      // WebView Zoom In: Ctrl+Plus or Ctrl+Equal
      else if (matchesShortcut('+', true, false, false) || matchesShortcut('=', true, false, false)) {
        console.log('[Webview Keyboard] Matched: Zoom In');
        const currentZoom = contents.getZoomFactor();
        const newZoom = Math.min(currentZoom + 0.1, 2.0);
        contents.setZoomFactor(newZoom);
        handled = true;
      }
      // WebView Zoom Out: Ctrl+Minus
      else if (matchesShortcut('-', true, false, false)) {
        console.log('[Webview Keyboard] Matched: Zoom Out');
        const currentZoom = contents.getZoomFactor();
        const newZoom = Math.max(currentZoom - 0.1, 0.5);
        contents.setZoomFactor(newZoom);
        handled = true;
      }
      // WebView Zoom Reset: Ctrl+0
      else if (matchesShortcut('0', true, false, false)) {
        console.log('[Webview Keyboard] Matched: Zoom Reset');
        contents.setZoomFactor(1.0);
        handled = true;
      }

      // Prevent default behavior if we handled the shortcut
      if (handled) {
        event.preventDefault();
      }
    });
  }

  // Set up download handler only once per session.
  // Multiple webContents share persist:main, so without this guard the handler
  // would be registered again for every new webview, causing duplicate dialogs.
  if (!downloadHandlerSessions.has(contents.session)) {
    downloadHandlerSessions.add(contents.session);
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
  }); // end will-download
  } // end downloadHandlerSessions guard

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

  // Show our custom Cut/Copy/Paste context menu for all webviews EXCEPT those
  // that ship their own JavaScript context menus (OWA, BBB, Nextcloud, Office 365).
  // For those, we let the page handle the contextmenu event itself.
  contents.on('context-menu', (e, params) => {
    const url = contents.getURL();
    const hasOwnContextMenu =
      url.includes('exchange.bbz-rd-eck.de') ||   // OWA
      url.includes('bbb.bbz-rd-eck.de') ||         // BigBlueButton
      url.includes('cloud.bbz-rd-eck.de') ||        // Nextcloud
      url.includes('microsoft.com') ||              // Office 365 / SharePoint
      url.includes('office.com') ||
      url.includes('sharepoint.com');

    if (!hasOwnContextMenu) {
      e.preventDefault();
      const selectedText = params.selectionText || '';

      const spellItems = [];
      if (params.misspelledWord) {
        const suggestions = params.dictionarySuggestions ?? [];
        suggestions.forEach(s => {
          spellItems.push({ label: s, click: () => contents.replaceMisspelling(s) });
        });
        if (suggestions.length > 0) {
          spellItems.push({ type: 'separator' });
        }
        spellItems.push({
          label: 'Zum Wörterbuch hinzufügen',
          click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        });
        spellItems.push({ type: 'separator' });
      }

      const menu = createContextMenu(contents, selectedText, spellItems);
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

  // Handle all new windows with our webview wrapper
  if (!url.includes('about:blank')) {
    // Create window with the same session
    createWebviewWindow(url, 'BBZCloud');
    return { action: 'deny' };
  }

    return { action: 'allow' };
  });

});

// On macOS, an application menu with Edit items is required for Cmd+C/V/X/Z/A
// to work in webviews. macOS routes these through the app responder chain,
// so without an Edit menu they have no handler. Windows/Linux are unaffected.
if (process.platform === 'darwin') {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { label: `Über ${app.name}`, role: 'about' },
        { type: 'separator' },
        { label: 'Beenden', role: 'quit' }
      ]
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { label: 'Rückgängig', role: 'undo' },
        { label: 'Wiederholen', role: 'redo' },
        { type: 'separator' },
        { label: 'Ausschneiden', role: 'cut' },
        { label: 'Kopieren', role: 'copy' },
        { label: 'Einfügen', role: 'paste' },
        { label: 'Alles auswählen', role: 'selectAll' }
      ]
    }
  ]));
} else {
  Menu.setApplicationMenu(null);
}

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
  if (autoUpdater.getFeedURL() && updateDownloaded) {
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
    
    // Register cleanup in the central registry so it fires exactly once on quit
    // and doesn't accumulate duplicate handlers across multiple file opens.
    secureFileCleanups.add(cleanup);

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

// Power save blocker to prevent macOS from suspending network connections
let powerSaveBlockerId = null;

app.on('ready', async () => {
  if (!gotTheLock) {
    app.quit();
    return;
  }
  
  // Start power save blocker on macOS to prevent network disconnection
  if (process.platform === 'darwin') {
    try {
      // 'prevent-app-suspension' prevents the app from being suspended
      // 'prevent-display-sleep' prevents the display from sleeping
      powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
      console.log('[macOS] Power save blocker started:', powerSaveBlockerId);
    } catch (error) {
      console.error('[macOS] Failed to start power save blocker:', error);
    }
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
    
    // Configure spell checker: prevent Google CDN downloads, use system/OS dictionaries
    const ses = session.fromPartition('persist:main');
    ses.setSpellCheckerDictionaryDownloadURL('https://localhost/disabled');
    if (process.platform !== 'darwin') {
      ses.setSpellCheckerLanguages(['de', 'en-GB']);
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

  // Helper: adjust window bounds to stay visible on current displays
  function adjustWindowBounds(win) {
    if (!win || win.isDestroyed()) return;
    const bounds = win.getBounds();
    const newBounds = ensureWindowBoundsVisible(bounds);
    if (newBounds !== bounds) {
      win.setBounds(newBounds);
    }
  }

  // Handle system resume: notify renderer to reload webviews with special handling
  powerMonitor.on('resume', async () => {
    console.log('[System] Resume detected');

    // Adjust main window position
    if (mainWindow) {
      adjustWindowBounds(mainWindow);
      // Notify renderer — WebViewContainer.js handles webview reloads with special
      // logic per app (Outlook: loadURL, WebUntis: check auth page, etc.)
      mainWindow.webContents.send('system-resumed', 'all');
    }

    // Adjust all webview windows
    windowRegistry.forEach((win) => adjustWindowBounds(win));
  });

  // Handle screen unlock: same as resume
  powerMonitor.on('unlock-screen', () => {
    console.log('[System] Screen unlocked');

    if (mainWindow) {
      adjustWindowBounds(mainWindow);
      // Notify renderer to reset credsAreSet
      mainWindow.webContents.send('system-resumed', 'all');
    }

    windowRegistry.forEach((win) => adjustWindowBounds(win));
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
