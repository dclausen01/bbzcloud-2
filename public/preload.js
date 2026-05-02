const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Version info
  getVersion: () => ipcRenderer.invoke('get-version'),
  // Existing methods
  getAssetPath: (asset) => ipcRenderer.invoke('get-asset-path', asset),
  openExternalWindow: (data) => ipcRenderer.invoke('open-external-window', data),
  injectJs: (data) => ipcRenderer.invoke('inject-js', data),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveCredentials: (data) => ipcRenderer.invoke('save-credentials', data),
  deleteCredentials: (data) => ipcRenderer.invoke('delete-credentials', data),
  getCredentials: async (data) => {
    try {
      return await ipcRenderer.invoke('get-credentials', data);
    } catch (error) {
      console.error('Error getting credentials:', error);
      return { success: false, error: error.message };
    }
  },
  hasDbCredentials: async (data) => {
    try {
      return await ipcRenderer.invoke('has-db-credentials', data);
    } catch (error) {
      console.error('Error checking DB credentials:', error);
      return { success: false, error: error.message, hasCredentials: false };
    }
  },
  setDbEncryptionKey: async (data) => {
    try {
      return await ipcRenderer.invoke('set-db-encryption-key', data);
    } catch (error) {
      console.error('Error setting DB encryption key:', error);
      return { success: false, error: error.message };
    }
  },
  restoreCredentialsFromDb: async (data) => {
    try {
      return await ipcRenderer.invoke('restore-credentials-from-db', data);
    } catch (error) {
      console.error('Error restoring credentials from DB:', error);
      return { success: false, error: error.message };
    }
  },
  onUpdateStatus: (callback) => {
    const subscription = (event, status) => callback(status);
    ipcRenderer.on('update-status', subscription);
    return () => {
      ipcRenderer.removeListener('update-status', subscription);
    };
  },
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onDownloadProgress: (callback) => {
    const subscription = (event, progress) => callback(progress);
    ipcRenderer.on('download', subscription);
    return () => {
      ipcRenderer.removeListener('download', subscription);
    };
  },
  
  // Theme change listener
  onThemeChanged: (callback) => {
    const subscription = (event, theme) => callback(theme);
    ipcRenderer.on('theme-changed', subscription);
    return () => {
      ipcRenderer.removeListener('theme-changed', subscription);
    };
  },

  // System resume listener
  onSystemResumed: (callback) => {
    const subscription = (event, webviewsToReload) => callback(webviewsToReload);
    ipcRenderer.on('system-resumed', subscription);
    return () => {
      ipcRenderer.removeListener('system-resumed', subscription);
    };
  },
  
  // Added methods from webview-preload.js
  send: (channel, data) => {
    // whitelist channels
    const validChannels = ['update-badge', 'contextMenu', 'showContextMenu', 'open-external'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  
  // Enhanced resolveAssetPath (combining both implementations)
  resolveAssetPath: async (asset) => {
    try {
      const assetPath = await ipcRenderer.invoke('get-asset-path', asset);
      return `file://${assetPath.replace(/\\/g, '/')}`;
    } catch (error) {
      console.error('Error resolving asset path:', error);
      throw error;
    }
  },
  
  // Enhanced executeJavaScript method
  executeJavaScript: async (params) => {
    try {
      return await ipcRenderer.invoke('inject-js', params);
    } catch (error) {
      console.error('Error executing JavaScript:', error);
      return { success: false, error: error.message };
    }
  },

  // Todo functionality
  getTodoState: async () => {
    try {
      return await ipcRenderer.invoke('get-todo-state');
    } catch (error) {
      console.error('Error getting todo state:', error);
      return { success: false, error: error.message };
    }
  },
  saveTodoState: async (state) => {
    try {
      return await ipcRenderer.invoke('save-todo-state', state);
    } catch (error) {
      console.error('Error saving todo state:', error);
      return { success: false, error: error.message };
    }
  },
  scheduleNotification: async (data) => {
    try {
      return await ipcRenderer.invoke('schedule-notification', data);
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return { success: false, error: error.message };
    }
  },
  
  // Secure Documents functionality
  checkSecureStoreAccess: async () => {
    try {
      return await ipcRenderer.invoke('check-secure-store-access');
    } catch (error) {
      console.error('Error checking secure store access:', error);
      return { success: false, error: error.message };
    }
  },
  listSecureFiles: async () => {
    try {
      return await ipcRenderer.invoke('list-secure-files');
    } catch (error) {
      console.error('Error listing secure files:', error);
      return { success: false, error: error.message };
    }
  },
  encryptAndStoreFile: async (data) => {
    try {
      return await ipcRenderer.invoke('encrypt-and-store-file', data);
    } catch (error) {
      console.error('Error encrypting and storing file:', error);
      return { success: false, error: error.message };
    }
  },
  openSecureFile: async (fileId) => {
    try {
      return await ipcRenderer.invoke('open-secure-file', fileId);
    } catch (error) {
      console.error('Error opening secure file:', error);
      return { success: false, error: error.message };
    }
  },
  deleteSecureFile: async (fileId) => {
    try {
      return await ipcRenderer.invoke('delete-secure-file', fileId);
    } catch (error) {
      console.error('Error deleting secure file:', error);
      return { success: false, error: error.message };
    }
  },

  // Database functionality
  getDatabasePath: () => ipcRenderer.invoke('get-database-path'),
  changeDatabaseLocation: (newPath) => ipcRenderer.invoke('change-database-location', newPath),
  migrateFromStore: () => ipcRenderer.invoke('migrate-from-store'),
  
  // Custom apps functionality
  getCustomApps: async () => {
    try {
      return await ipcRenderer.invoke('get-custom-apps');
    } catch (error) {
      console.error('Error getting custom apps:', error);
      return { success: false, error: error.message };
    }
  },
  saveCustomApps: async (apps) => {
    try {
      return await ipcRenderer.invoke('save-custom-apps', apps);
    } catch (error) {
      console.error('Error saving custom apps:', error);
      return { success: false, error: error.message };
    }
  },
  reencryptData: async (oldPassword, newPassword) => {
    try {
      return await ipcRenderer.invoke('reencrypt-data', { oldPassword, newPassword });
    } catch (error) {
      console.error('Error reencrypting data:', error);
      return { success: false, error: error.message };
    }
  },

  // Event listeners for secure file updates and database changes
  on: (channel, callback) => {
    const validChannels = ['secure-file-updated', 'database-changed'];
    if (validChannels.includes(channel)) {
      const subscription = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
  },
  // Note: prefer using the cleanup function returned by on() over calling off() directly.
  // off() cannot remove the internal subscription wrapper created by on(), so it is a no-op.
  // It is kept for API compatibility only.
  off: (_channel, _callback) => {},
  emit: (channel) => {
    const validChannels = ['database-changed'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel);
    }
  },

  // GitHub issue creation
  createGithubIssue: async (data) => {
    try {
      return await ipcRenderer.invoke('create-github-issue', data);
    } catch (error) {
      console.error('Error creating GitHub issue:', error);
      return { success: false, error: error.message };
    }
  },

  // Zoom control
  setZoomFactor: async (webContentsId, zoomFactor) => {
    try {
      return await ipcRenderer.invoke('set-zoom-factor', { webContentsId, zoomFactor });
    } catch (error) {
      console.error('Error setting zoom factor:', error);
      return { success: false, error: error.message };
    }
  },

  // App reload functionality
  reloadApp: () => ipcRenderer.invoke('reload-app'),
  
  // Autostart functionality
  setAutostart: (shouldAutostart) => ipcRenderer.invoke('set-autostart', shouldAutostart),

  // Shell functionality
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell-open-external', url)
  },

  // Webview message handling
  onMessage: (callback) => {
    const subscription = (event, message) => callback(message);
    ipcRenderer.on('webview-message', subscription);
    return () => {
      ipcRenderer.removeListener('webview-message', subscription);
    };
  },
  // Note: prefer using the cleanup function returned by onMessage() over offMessage().
  // offMessage() cannot remove the internal subscription wrapper; it is a no-op.
  offMessage: (_callback) => {},

  
  // Global shortcut registration (for main window)
  registerGlobalShortcut: async (shortcut, handler) => {
    try {
      const success = await ipcRenderer.invoke('register-global-shortcut', { shortcut });
      if (success && handler) {
        // Store handler for when shortcut is triggered
        ipcRenderer.on(`global-shortcut-${shortcut}`, handler);
      }
      return success;
    } catch (error) {
      console.error('Error registering global shortcut:', error);
      return false;
    }
  },
  
  unregisterGlobalShortcut: async (shortcut) => {
    try {
      const success = await ipcRenderer.invoke('unregister-global-shortcut', { shortcut });
      // Remove all listeners for this shortcut
      ipcRenderer.removeAllListeners(`global-shortcut-${shortcut}`);
      return success;
    } catch (error) {
      console.error('Error unregistering global shortcut:', error);
      return false;
    }
  },
  
  unregisterAllGlobalShortcuts: async () => {
    try {
      return await ipcRenderer.invoke('unregister-all-global-shortcuts');
    } catch (error) {
      console.error('Error unregistering all global shortcuts:', error);
      return false;
    }
  },
  
  // Listen for shortcut events from main process
  onShortcut: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('shortcut-triggered', handler);
    return () => ipcRenderer.removeListener('shortcut-triggered', handler);
  },

  // Get webview preload script path
  getWebviewPreloadPath: () => ipcRenderer.invoke('get-webview-preload-path'),

  // -------------------------------------------------------------------------
  // WebContentsView API  (view:* channels)
  // -------------------------------------------------------------------------
  view: {
    create: (opts) => ipcRenderer.invoke('view:create', opts),
    show: (appId) => ipcRenderer.invoke('view:show', { appId }),
    hide: (appId) => ipcRenderer.invoke('view:hide', { appId }),
    destroy: (appId) => ipcRenderer.invoke('view:destroy', { appId }),
    navigate: (appId, url) => ipcRenderer.invoke('view:navigate', { appId, url }),
    reload: (appId, ignoreCache) => ipcRenderer.invoke('view:reload', { appId, ignoreCache }),
    goBack: (appId) => ipcRenderer.invoke('view:goBack', { appId }),
    goForward: (appId) => ipcRenderer.invoke('view:goForward', { appId }),
    executeJavaScript: (appId, code, userGesture) =>
      ipcRenderer.invoke('view:executeJavaScript', { appId, code, userGesture }),
    print: (appId) => ipcRenderer.invoke('view:print', { appId }),
    openDevTools: (appId) => ipcRenderer.invoke('view:openDevTools', { appId }),
    setZoomFactor: (appId, factor) =>
      ipcRenderer.invoke('view:setZoomFactor', { appId, factor }),
    getState: (appId) => ipcRenderer.invoke('view:getState', { appId }),
    clearHistory: (appId) => ipcRenderer.invoke('view:clearHistory', { appId }),
    // Fire-and-forget — called on every animation frame during resize
    setBounds: (rect) => ipcRenderer.send('view:setBounds', rect),

    // Subscribe to per-view events forwarded from the main process.
    // Returns a cleanup function.
    onEvent: (callback) => {
      const sub = (_e, payload) => callback(payload);
      ipcRenderer.on('view:event', sub);
      return () => ipcRenderer.removeListener('view:event', sub);
    },

    // Subscribe to badge updates from WCVs.
    onBadgeUpdate: (callback) => {
      const sub = (_e, payload) => callback(payload);
      ipcRenderer.on('view:badge-update', sub);
      return () => ipcRenderer.removeListener('view:badge-update', sub);
    },
  },

  // -------------------------------------------------------------------------
  // Overlay window API  (overlay:* channels)
  // -------------------------------------------------------------------------
  overlay: {
    // Called by the main React app to show the overlay with a payload
    // (e.g. { surface: 'commandPalette', commands: [...] })
    open: (payload) => ipcRenderer.invoke('overlay:open', payload),
    hide: () => ipcRenderer.invoke('overlay:hide'),

    // Fire-and-forget — sent from the overlay surface to the main window
    // (e.g. { type: 'command', id: 'nav-moodle' } or { type: 'close' })
    sendAction: (action) => ipcRenderer.send('overlay:action', action),

    // Subscribe to overlay events.
    // - onOpen: receives the payload from main when the overlay should render
    // - onHide: notification that the overlay is being hidden
    // - onAction: forwarded actions from the overlay (used by main window)
    // - onClosed: notification that the overlay was dismissed (used by main window)
    onOpen: (callback) => {
      const sub = (_e, payload) => callback(payload);
      ipcRenderer.on('overlay:open', sub);
      return () => ipcRenderer.removeListener('overlay:open', sub);
    },
    onHide: (callback) => {
      const sub = () => callback();
      ipcRenderer.on('overlay:hide', sub);
      return () => ipcRenderer.removeListener('overlay:hide', sub);
    },
    onAction: (callback) => {
      const sub = (_e, action) => callback(action);
      ipcRenderer.on('overlay:action', sub);
      return () => ipcRenderer.removeListener('overlay:action', sub);
    },
    onClosed: (callback) => {
      const sub = () => callback();
      ipcRenderer.on('overlay:closed', sub);
      return () => ipcRenderer.removeListener('overlay:closed', sub);
    },
  },
});



// Remove this if you don't need it
window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type]);
  }
});
