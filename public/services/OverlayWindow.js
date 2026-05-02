'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * OverlayWindow
 *
 * A frameless transparent child BrowserWindow that always overlays the main
 * window's content area. Used to host UI that must visually sit *above* a
 * WebContentsView (which is composited on top of the React DOM).
 *
 * Currently hosts the CommandPalette; can be extended for download toasts etc.
 *
 * Lifecycle:
 *   - Created lazily on first open()
 *   - Hidden by default; show() on open(), hide() on close
 *   - Bounds re-applied whenever the main window is moved/resized
 *   - Hides itself on blur (click outside)
 *   - Loads the same React bundle as the main window with `?surface=overlay`
 */
class OverlayWindow {
  constructor() {
    this.window = null;
    this.mainWindow = null;
    this.isVisible = false;
    this._isDev = false;
    this._pendingPayload = null;
  }

  init(mainWindow, { isDev = false } = {}) {
    this.mainWindow = mainWindow;
    this._isDev = isDev;
  }

  _create() {
    if (this.window && !this.window.isDestroyed()) return;

    this.window = new BrowserWindow({
      parent: this.mainWindow,
      frame: false,
      transparent: true,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '..', 'preload.js'),
        sandbox: false,
        partition: 'persist:main',
        webSecurity: true,
      },
    });

    const baseUrl = this._isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../../build/index.html')}`;
    this.window.loadURL(`${baseUrl}?surface=overlay`);
    this.window.setMenu(null);

    // If a payload was queued before the page finished loading, send it now.
    this.window.webContents.once('did-finish-load', () => {
      if (this._pendingPayload) {
        this.window.webContents.send('overlay:open', this._pendingPayload);
        this._pendingPayload = null;
      }
    });

    // Sync bounds with main window on every move/resize
    this._syncBounds();
    if (this.mainWindow) {
      const onMove = () => this._syncBounds();
      const onResize = () => this._syncBounds();
      this.mainWindow.on('move', onMove);
      this.mainWindow.on('resize', onResize);
      this.window.on('closed', () => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.removeListener('move', onMove);
          this.mainWindow.removeListener('resize', onResize);
        }
      });
    }

    // Hide on blur (clicked outside)
    this.window.on('blur', () => {
      if (this.isVisible) {
        this.hide();
        // Notify main window so it can update its state
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('overlay:closed');
        }
      }
    });

    this.window.on('closed', () => {
      this.window = null;
      this.isVisible = false;
    });
  }

  _syncBounds() {
    if (!this.window || this.window.isDestroyed()) return;
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    try {
      const bounds = this.mainWindow.getContentBounds();
      this.window.setBounds(bounds);
    } catch (_) {
      // ignore — window may be transitioning
    }
  }

  open(payload) {
    this._create();
    this._syncBounds();

    // Queue the payload if the window hasn't finished loading yet
    if (this.window.webContents.isLoading()) {
      this._pendingPayload = payload;
    } else {
      this.window.webContents.send('overlay:open', payload);
    }

    this.window.show();
    this.window.focus();
    this.isVisible = true;
  }

  hide() {
    if (!this.window || this.window.isDestroyed()) return;
    if (!this.isVisible) return;
    this.isVisible = false;
    try {
      this.window.webContents.send('overlay:hide');
      this.window.hide();
    } catch (_) {}
  }

  destroy() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
    this.isVisible = false;
  }

  forwardActionToMain(action) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('overlay:action', action);
    }
  }
}

module.exports = new OverlayWindow();
