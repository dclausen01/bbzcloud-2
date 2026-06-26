'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hub', {
  getCredentials: () => ipcRenderer.invoke('get-credentials'),
  saveCredentials: (data) => ipcRenderer.invoke('save-credentials', data),
  close: () => window.close(),
});
