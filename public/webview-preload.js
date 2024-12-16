const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron',
  {
    // IPC communication
    send: (channel, data) => {
      // whitelist channels
      const validChannels = ['update-badge', 'contextMenu'];
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
    }
  }
);
