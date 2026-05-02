'use strict';

const { WebContentsView, session, Menu, shell } = require('electron');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// URLs that ship their own context menus — don't replace with ours.
const OWN_CONTEXT_MENU_HOSTS = [
  'exchange.bbz-rd-eck.de',
  'bbb.bbz-rd-eck.de',
  'cloud.bbz-rd-eck.de',
  'microsoft.com',
  'office.com',
  'sharepoint.com',
];

class ViewManager {
  constructor() {
    // Map<appId, { view: WebContentsView, zoomFactor: number }>
    this.views = new Map();
    this.activeViewId = null;
    // Last content rect reported by the renderer (CSS/DIP pixels)
    this.contentRect = { x: 0, y: 0, width: 800, height: 600 };
    this.mainWindow = null;
    this.preloadPath = null;
    // Injected by electron.js so ViewManager can open popup windows
    this._createWebviewWindow = null;
  }

  // -------------------------------------------------------------------------
  // Initialisation — call once after mainWindow is ready
  // -------------------------------------------------------------------------

  init(mainWindow, preloadPath, createWebviewWindow) {
    this.mainWindow = mainWindow;
    this.preloadPath = preloadPath;
    this._createWebviewWindow = createWebviewWindow;

    // Re-apply bounds whenever the OS moves or resizes the window
    for (const ev of ['resize', 'move', 'enter-full-screen', 'leave-full-screen']) {
      mainWindow.on(ev, () => this._applyBounds());
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  _getSession() {
    return session.fromPartition('persist:main');
  }

  _applyBounds() {
    if (!this.activeViewId) return;
    const entry = this.views.get(this.activeViewId);
    if (!entry) return;
    const { x, y, width, height } = this.contentRect;
    entry.view.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    });
  }

  _sendEvent(appId, type, extra = {}) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('view:event', { appId, type, ...extra });
    }
  }

  _installEventForwarding(appId, view) {
    const wc = view.webContents;
    const fwd = (type, extra) => this._sendEvent(appId, type, extra);

    wc.on('did-start-loading', () => fwd('did-start-loading'));
    wc.on('did-stop-loading', () => fwd('did-stop-loading'));
    wc.on('dom-ready', () => fwd('dom-ready', { url: wc.getURL() }));
    wc.on('did-navigate', (_e, url) => fwd('did-navigate', { url }));
    wc.on('did-navigate-in-page', (_e, url) => fwd('did-navigate-in-page', { url }));
    wc.on('did-finish-load', () => fwd('did-finish-load', { url: wc.getURL() }));
    wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) =>
      fwd('did-fail-load', { errorCode, errorDescription, validatedURL })
    );
    wc.on('render-process-gone', (_e, details) => fwd('render-process-gone', { details }));

    wc.on('page-title-updated', (_e, title) => {
      // Badge detection: "(N) BBZ Chat" title pattern
      if (title && title.includes('BBZ Chat')) {
        const match = title.match(/^\((\d+)\)/);
        const count = match ? parseInt(match[1], 10) : 0;
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('view:badge-update', { appId, count });
        }
      }
      fwd('page-title-updated', { title });
    });
  }

  _installShortcutHandler(_appId, view) {
    const wc = view.webContents;

    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;

      const key = input.key.toLowerCase();
      const ctrl = input.control || input.meta;
      const alt = input.alt;
      const shift = input.shift;

      const match = (k, c = false, a = false, s = false) =>
        key === k && !!ctrl === c && !!alt === a && !!shift === s;

      let handled = false;

      const sendToMain = (action) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('webview-message', {
            type: 'webview-shortcut',
            action,
          });
        }
        handled = true;
      };

      if (match('p', true, false, true)) sendToMain('command-palette');
      else if (match('t', true, false, true)) sendToMain('toggle-todo');
      else if (match('d', true, false, false)) sendToMain('toggle-secure-docs');
      else if (match(',', true, false, false)) sendToMain('open-settings');
      else if (match('r', true, false, false)) sendToMain('reload-current');
      else if (match('r', true, false, true)) sendToMain('reload-all');
      else if (match('f11', false, false, false)) sendToMain('toggle-fullscreen');
      else if (match('escape', false, false, false)) sendToMain('close-modal');
      else if (ctrl && !alt && !shift && key >= '1' && key <= '9') sendToMain(`nav-app-${key}`);
      else if (match('f5', false, false, false)) { wc.reload(); handled = true; }
      else if (match('arrowleft', false, true, false)) {
        if (wc.canGoBack()) { wc.goBack(); handled = true; }
      }
      else if (match('arrowright', false, true, false)) {
        if (wc.canGoForward()) { wc.goForward(); handled = true; }
      }
      else if (match('p', true, false, false)) { wc.print(); handled = true; }
      else if (match('+', true, false, false) || match('=', true, false, false)) {
        wc.setZoomFactor(Math.min(wc.getZoomFactor() + 0.1, 2.0)); handled = true;
      }
      else if (match('-', true, false, false)) {
        wc.setZoomFactor(Math.max(wc.getZoomFactor() - 0.1, 0.5)); handled = true;
      }
      else if (match('0', true, false, false)) { wc.setZoomFactor(1.0); handled = true; }

      if (handled) event.preventDefault();
    });
  }

  _installContextMenu(_appId, view) {
    view.webContents.on('context-menu', (e, params) => {
      const url = view.webContents.getURL();
      const hasOwn = OWN_CONTEXT_MENU_HOSTS.some(h => url.includes(h));
      if (hasOwn) return;

      e.preventDefault();
      const spellItems = [];
      if (params.misspelledWord) {
        const suggestions = params.dictionarySuggestions ?? [];
        suggestions.forEach(s => {
          spellItems.push({
            label: s,
            click: () => view.webContents.replaceMisspelling(s),
          });
        });
        if (suggestions.length) spellItems.push({ type: 'separator' });
        spellItems.push({
          label: 'Zum Wörterbuch hinzufügen',
          click: () =>
            view.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        });
        spellItems.push({ type: 'separator' });
      }

      const menu = Menu.buildFromTemplate([
        ...spellItems,
        { label: 'Ausschneiden', role: 'cut' },
        { label: 'Kopieren', role: 'copy' },
        { label: 'Einfügen', role: 'paste' },
      ]);
      menu.popup({ window: this.mainWindow });
    });
  }

  _installWindowOpenHandler(_appId, view) {
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (
        url.includes('bbb.bbz-rd-eck.de/bigbluebutton/api/join?') ||
        url.includes('meet.stashcat.com')
      ) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
      if (!url.includes('about:blank')) {
        if (this._createWebviewWindow) this._createWebviewWindow(url, 'BBZCloud');
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async create(appId, { url, userAgent, preloadOverride } = {}) {
    if (this.views.has(appId)) return;

    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadOverride || this.preloadPath,
        session: this._getSession(),
        sandbox: false,
        webSecurity: true,
      },
    });

    view.webContents.setUserAgent(userAgent || USER_AGENT);

    this._installEventForwarding(appId, view);
    this._installShortcutHandler(appId, view);
    // Note: context-menu and setWindowOpenHandler are already installed in
    // electron.js's app.on('web-contents-created') handler — which fires for
    // every webContents, including those inside WebContentsView. Adding them
    // here as well would cause duplicate menus to pop on right-click.
    // _installContextMenu / _installWindowOpenHandler are kept as dead code
    // for reference but no longer called.

    this.mainWindow.contentView.addChildView(view);
    view.setVisible(false);

    this.views.set(appId, { view, zoomFactor: 1.0 });

    if (url) {
      view.webContents.loadURL(url);
    }
  }

  show(appId) {
    if (!this.views.has(appId)) return;

    // Hide the previous active view
    if (this.activeViewId && this.activeViewId !== appId) {
      const prev = this.views.get(this.activeViewId);
      if (prev) prev.view.setVisible(false);
    }

    this.activeViewId = appId;
    this._applyBounds();
    const entry = this.views.get(appId);
    entry.view.setVisible(true);

    try { entry.view.webContents.focus(); } catch (_) {}
  }

  hide(appId) {
    const entry = this.views.get(appId);
    if (entry) entry.view.setVisible(false);
    if (this.activeViewId === appId) this.activeViewId = null;
  }

  destroy(appId) {
    const entry = this.views.get(appId);
    if (!entry) return;
    entry.view.setVisible(false);
    try { this.mainWindow.contentView.removeChildView(entry.view); } catch (_) {}
    try { entry.view.webContents.close(); } catch (_) {}
    this.views.delete(appId);
    if (this.activeViewId === appId) this.activeViewId = null;
  }

  setBounds(rect) {
    this.contentRect = rect;
    this._applyBounds();
  }

  navigate(appId, url) {
    const entry = this.views.get(appId);
    if (entry) entry.view.webContents.loadURL(url);
  }

  reload(appId, ignoreCache = false) {
    const entry = this.views.get(appId);
    if (!entry) return;
    if (ignoreCache) entry.view.webContents.reloadIgnoringCache();
    else entry.view.webContents.reload();
  }

  reloadAll(ignoreCache = false) {
    for (const entry of this.views.values()) {
      if (ignoreCache) entry.view.webContents.reloadIgnoringCache();
      else entry.view.webContents.reload();
    }
  }

  goBack(appId) {
    const entry = this.views.get(appId);
    if (entry && entry.view.webContents.canGoBack()) entry.view.webContents.goBack();
  }

  goForward(appId) {
    const entry = this.views.get(appId);
    if (entry && entry.view.webContents.canGoForward()) entry.view.webContents.goForward();
  }

  async executeJavaScript(appId, code, userGesture = false) {
    const entry = this.views.get(appId);
    if (!entry) throw new Error(`[ViewManager] View not found: ${appId}`);
    return entry.view.webContents.executeJavaScript(code, userGesture);
  }

  print(appId) {
    const entry = this.views.get(appId);
    if (entry) entry.view.webContents.print();
  }

  openDevTools(appId) {
    const entry = this.views.get(appId);
    if (entry) entry.view.webContents.openDevTools();
  }

  setZoomFactor(appId, factor) {
    const entry = this.views.get(appId);
    if (!entry) return;
    entry.view.webContents.setZoomFactor(factor);
    entry.zoomFactor = factor;
  }

  getState(appId) {
    const entry = this.views.get(appId);
    if (!entry) return null;
    const wc = entry.view.webContents;
    return {
      url: wc.getURL(),
      title: wc.getTitle(),
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
      isLoading: wc.isLoading(),
      zoomFactor: entry.zoomFactor,
    };
  }

  clearHistory(appId) {
    const entry = this.views.get(appId);
    if (entry) entry.view.webContents.clearHistory();
  }

  getActiveViewId() {
    return this.activeViewId;
  }

  has(appId) {
    return this.views.has(appId);
  }
}

module.exports = new ViewManager();
