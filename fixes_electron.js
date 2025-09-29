// Kritische Korrekturen für electron.js

// 1. Zeile 49 korrigieren:
if (url.includes('exchange.bbz-rd-eck.de/owa')) {

// 2. Alle browserViewManager Referenzen ersetzen:
// Zeile 1074 und weitere:
if (!webContentsViewManager) {
  console.error('[Keyboard Shortcut] WebContentsViewManager not initialized');
  return;
}

const view = webContentsViewManager.getActiveWebContentsView();

// 3. IPC Handler umbenennen oder Backward-Compatibility hinzufügen:
// Entweder alle "browserview-" zu "webcontentsview-" ändern
// Oder beide Handler bereitstellen für Kompatibilität
