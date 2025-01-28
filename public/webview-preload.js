const { contextBridge, ipcRenderer } = require('electron');

// Override console methods to bridge them to the main process
const originalConsole = console;
['log', 'error', 'warn', 'info'].forEach(method => {
  console[method] = (...args) => {
    // Call original console method
    originalConsole[method](...args);
    // Send to main process
    ipcRenderer.send('console-message', {
      method,
      args: args.map(arg => {
        try {
          return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
        } catch (e) {
          return String(arg);
        }
      })
    });
  };
});

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
    }
  }
);
