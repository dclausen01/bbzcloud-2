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
    receive: (channel, func) => {
      const validChannels = ['inject-js'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender` 
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    // Execute JavaScript in webview context
    executeJavaScript: async (code) => {
      try {
        // Use the webContents.executeJavaScript instead of eval
        return await ipcRenderer.invoke('inject-js', { code });
      } catch (error) {
        console.error('Error executing JavaScript:', error);
        throw error;
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
    }
  }
);

// Listen for inject-js events
ipcRenderer.on('inject-js', async (event, { code }) => {
  try {
    await ipcRenderer.invoke('inject-js', { code });
  } catch (error) {
    console.error('Error executing injected JavaScript:', error);
  }
});
