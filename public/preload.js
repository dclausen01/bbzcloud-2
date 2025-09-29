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
  getCredentials: async (data) => {
    try {
      return await ipcRenderer.invoke('get-credentials', data);
    } catch (error) {
      console.error('Error getting credentials:', error);
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
    const validChannels = ['update-badge', 'contextMenu', 'open-external'];
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
  
  // Context menu todo addition listener
  onAddTodo: (callback) => {
    const subscription = (_event, text) => callback(text);
    ipcRenderer.on('add-todo', subscription);
    return () => {
      ipcRenderer.removeListener('add-todo', subscription);
    };
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
  off: (channel, callback) => {
    const validChannels = ['secure-file-updated', 'database-changed'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  },
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
  offMessage: (callback) => {
    ipcRenderer.removeListener('webview-message', callback);
  },

  
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

  // ============================================================================
  // BROWSERVIEW IPC METHODS
  // ============================================================================

  // Create a new BrowserView
  createBrowserView: async (id, url, options = {}) => {
    try {
      return await ipcRenderer.invoke('browserview-create', { id, url, options });
    } catch (error) {
      console.error('Error creating BrowserView:', error);
      return { success: false, error: error.message };
    }
  },

  // Show a specific BrowserView
  showBrowserView: async (id) => {
    try {
      return await ipcRenderer.invoke('browserview-show', { id });
    } catch (error) {
      console.error('Error showing BrowserView:', error);
      return { success: false, error: error.message };
    }
  },

  // Hide the currently active BrowserView
  hideBrowserView: async () => {
    try {
      return await ipcRenderer.invoke('browserview-hide');
    } catch (error) {
      console.error('Error hiding BrowserView:', error);
      return { success: false, error: error.message };
    }
  },

  // Navigate a BrowserView to a new URL
  navigateBrowserView: async (id, url) => {
    try {
      return await ipcRenderer.invoke('browserview-navigate', { id, url });
    } catch (error) {
      console.error('Error navigating BrowserView:', error);
      return { success: false, error: error.message };
    }
  },

  // Reload a specific BrowserView
  reloadBrowserView: async (id) => {
    try {
      return await ipcRenderer.invoke('browserview-reload', { id });
    } catch (error) {
      console.error('Error reloading BrowserView:', error);
      return { success: false, error: error.message };
    }
  },

  // Execute JavaScript in a BrowserView
  executeBrowserViewJS: async (id, code) => {
    try {
      return await ipcRenderer.invoke('browserview-execute-js', { id, code });
    } catch (error) {
      console.error('Error executing JavaScript in BrowserView:', error);
      return { success: false, error: error.message };
    }
  },

  // Get the current URL of a BrowserView
  getBrowserViewURL: async (id) => {
    try {
      return await ipcRenderer.invoke('browserview-get-url', { id });
    } catch (error) {
      console.error('Error getting BrowserView URL:', error);
      return { success: false, error: error.message };
    }
  },

  // Initialize standard apps as BrowserViews
  initStandardAppsBrowserViews: async (standardApps) => {
    try {
      return await ipcRenderer.invoke('browserview-init-standard-apps', { standardApps });
    } catch (error) {
      console.error('Error initializing standard apps as BrowserViews:', error);
      return { success: false, error: error.message };
    }
  },

  // Destroy a specific BrowserView
  destroyBrowserView: async (id) => {
    try {
      return await ipcRenderer.invoke('browserview-destroy', { id });
    } catch (error) {
      console.error('Error destroying BrowserView:', error);
      return { success: false, error: error.message };
    }
  },

  // Get BrowserViewManager statistics
  getBrowserViewStats: async () => {
    try {
      return await ipcRenderer.invoke('browserview-get-stats');
    } catch (error) {
      console.error('Error getting BrowserView stats:', error);
      return { success: false, error: error.message };
    }
  },

  // Listen for BrowserView events
  onBrowserViewLoading: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('browserview-loading', subscription);
    return () => {
      ipcRenderer.removeListener('browserview-loading', subscription);
    };
  },

  onBrowserViewLoaded: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('browserview-loaded', subscription);
    return () => {
      ipcRenderer.removeListener('browserview-loaded', subscription);
    };
  },

  onBrowserViewNavigated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('browserview-navigated', subscription);
    return () => {
      ipcRenderer.removeListener('browserview-navigated', subscription);
    };
  },

  onBrowserViewError: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('browserview-error', subscription);
    return () => {
      ipcRenderer.removeListener('browserview-error', subscription);
    };
  },

  onBrowserViewActivated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('browserview-activated', subscription);
    return () => {
      ipcRenderer.removeListener('browserview-activated', subscription);
    };
  },

  onBrowserViewNewWindow: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('browserview-new-window', subscription);
    return () => {
      ipcRenderer.removeListener('browserview-new-window', subscription);
    };
  },

  onBrowserViewContextMenu: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('browserview-context-menu', subscription);
    return () => {
      ipcRenderer.removeListener('browserview-context-menu', subscription);
    };
  },

  // Listen for BrowserView messages (including debug keyboard events)
  onBrowserViewMessage: (callback) => {
    const subscription = (event, message) => callback(message);
    ipcRenderer.on('browserview-message', subscription);
    return () => {
      ipcRenderer.removeListener('browserview-message', subscription);
    };
  },

  // Listen for credential injection results
  onCredentialInjectionResult: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('credential-injection-result', subscription);
    return () => {
      ipcRenderer.removeListener('credential-injection-result', subscription);
    };
  }
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
