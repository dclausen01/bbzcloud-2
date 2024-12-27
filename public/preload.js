const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
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
  getTodoState: () => ipcRenderer.invoke('get-todo-state'),
  saveTodoState: (state) => ipcRenderer.invoke('save-todo-state', state),
  scheduleNotification: (data) => ipcRenderer.invoke('schedule-notification', data),
  
  // Context menu todo addition listener
  onAddTodo: (callback) => {
    const subscription = (_event, text) => callback(text);
    ipcRenderer.on('add-todo', subscription);
    return () => {
      ipcRenderer.removeListener('add-todo', subscription);
    };
  },
  // Debug helper
  debug: (msg) => console.log('Debug:', msg),

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

  // Event listeners for secure file updates
  on: (channel, callback) => {
    const validChannels = ['secure-file-updated'];
    if (validChannels.includes(channel)) {
      const subscription = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
  },
  off: (channel, callback) => {
    const validChannels = ['secure-file-updated'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
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
