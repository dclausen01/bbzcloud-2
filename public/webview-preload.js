const { contextBridge, ipcRenderer } = require('electron');

// Bridge critical errors to main process
const originalError = console.error;
console.error = (...args) => {
  originalError.apply(console, args);
  ipcRenderer.send('console-message', {
    method: 'error',
    args: args.map(arg => String(arg))
  });
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron',
  {
    // IPC communication
    send: (channel, data) => {
      // whitelist channels
      const validChannels = ['update-badge', 'contextMenu', 'open-external', 'console-message', 'webview-message'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    // Get credentials from the main process
    getCredentials: async (params) => {
      try {
        return await ipcRenderer.invoke('get-credentials', params);
      } catch (error) {
        console.error('Error getting credentials:', error);
        return { success: false, error: error.message };
      }
    },
    // Save credentials to the main process
    saveCredentials: async (params) => {
      try {
        return await ipcRenderer.invoke('save-credentials', params);
      } catch (error) {
        console.error('Error saving credentials:', error);
        return { success: false, error: error.message };
      }
    },
    // Get settings from electron-store
    getSettings: async () => {
      try {
        return await ipcRenderer.invoke('get-settings');
      } catch (error) {
        console.error('Error getting settings:', error);
        return { success: false, error: error.message };
      }
    },
    // Execute JavaScript in webview
    executeJavaScript: async (params) => {
      try {
        return await ipcRenderer.invoke('inject-js', params);
      } catch (error) {
        console.error('Error executing JavaScript:', error);
        return { success: false, error: error.message };
      }
    },
    // Resolve asset path
    resolveAssetPath: async (asset) => {
      try {
        return await ipcRenderer.invoke('get-asset-path', asset);
      } catch (error) {
        console.error('Error resolving asset path:', error);
        throw error;
      }
    },
    // Listen for theme changes
    onThemeChanged: (callback) => {
      // Listen for direct theme changes
      ipcRenderer.on('theme-changed', (_, theme) => callback(theme));
      // Listen for theme changes from parent window
      ipcRenderer.on('theme-changed-frame', (_, theme) => callback(theme));
    },
    // Message handling
    onMessage: (callback) => {
      ipcRenderer.on('webview-message', (_, message) => callback(message));
    },
    offMessage: (callback) => {
      ipcRenderer.removeListener('webview-message', callback);
    }
  }
);
