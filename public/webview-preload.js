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
      const validChannels = ['update-badge', 'contextMenu', 'open-external', 'console-message', 'webview-message', 'keyboard-shortcut'];
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
    },
    
    
    // Global shortcut registration (for webviews)
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
    }
  }
);


// ============================================================================
// KEYBOARD SHORTCUT CAPTURE SYSTEM
// ============================================================================

/**
 * Keyboard shortcuts that should be captured at the webview level
 * These shortcuts will be intercepted before remote websites can handle them
 * Based on the shortcuts defined in src/utils/constants.js
 */
const WEBVIEW_SHORTCUTS = [
  // Navigation shortcuts
  { key: 'F5', ctrlKey: false, altKey: false, shiftKey: false, action: 'webview-refresh' },
  { key: 'ArrowLeft', ctrlKey: false, altKey: true, shiftKey: false, action: 'webview-back' },
  { key: 'ArrowRight', ctrlKey: false, altKey: true, shiftKey: false, action: 'webview-forward' },
  
  // Utility shortcuts
  { key: 'p', ctrlKey: true, altKey: false, shiftKey: false, action: 'webview-print' },
  { key: 'f', ctrlKey: true, altKey: false, shiftKey: false, action: 'webview-find' },
  { key: 'r', ctrlKey: true, altKey: false, shiftKey: false, action: 'webview-refresh' },
  
  // Zoom shortcuts
  { key: '+', ctrlKey: true, altKey: false, shiftKey: false, action: 'webview-zoom-in' },
  { key: '=', ctrlKey: true, altKey: false, shiftKey: false, action: 'webview-zoom-in' }, // Alternative for +
  { key: '-', ctrlKey: true, altKey: false, shiftKey: false, action: 'webview-zoom-out' },
  { key: '0', ctrlKey: true, altKey: false, shiftKey: false, action: 'webview-zoom-reset' },
  
  // Global shortcuts that should work from webviews
  { key: 'p', ctrlKey: true, altKey: false, shiftKey: true, action: 'command-palette' }, // Ctrl+Shift+P
  { key: 't', ctrlKey: true, altKey: false, shiftKey: true, action: 'toggle-todo' }, // Ctrl+Shift+T
  { key: 'd', ctrlKey: true, altKey: false, shiftKey: false, action: 'toggle-secure-docs' }, // Ctrl+D
  { key: ',', ctrlKey: true, altKey: false, shiftKey: false, action: 'open-settings' }, // Ctrl+,
  
  // Modal/overlay shortcuts (should work even in input fields)
  { key: 'Escape', ctrlKey: false, altKey: false, shiftKey: false, action: 'close-modal' },
];

/**
 * Check if the current element is an input field where we should allow normal typing
 * Some shortcuts (like Escape) should still work even in input fields
 */
function isInputField(element) {
  if (!element) return false;
  
  const tagName = element.tagName?.toLowerCase();
  const isContentEditable = element.contentEditable === 'true' || element.isContentEditable;
  
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    isContentEditable ||
    element.getAttribute('role') === 'textbox'
  );
}

/**
 * Check if a keyboard event matches a defined shortcut
 */
function matchesShortcut(event, shortcut) {
  // Normalize key names for comparison
  let eventKey = event.key;
  if (eventKey === 'Left') eventKey = 'ArrowLeft';
  if (eventKey === 'Right') eventKey = 'ArrowRight';
  if (eventKey === 'Up') eventKey = 'ArrowUp';
  if (eventKey === 'Down') eventKey = 'ArrowDown';
  
  return (
    eventKey === shortcut.key &&
    !!event.ctrlKey === !!shortcut.ctrlKey &&
    !!event.altKey === !!shortcut.altKey &&
    !!event.shiftKey === !!shortcut.shiftKey
  );
}

/**
 * Main keyboard event handler for webview shortcuts
 * This runs in the capture phase to intercept events before websites can handle them
 */
function handleKeyboardShortcut(event) {
  const activeElement = document.activeElement;
  const isInInputField = isInputField(activeElement);
  
  // Create shortcut string for debugging
  const shortcutString = createShortcutString(event);
  
  // Always send debug information to main process for debug tool
  ipcRenderer.send('webview-message', {
    type: 'debug-keyboard-event',
    shortcut: shortcutString,
    key: event.key,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    target: activeElement?.tagName || 'unknown',
    isInInputField,
    url: window.location.href,
    timestamp: Date.now()
  });
  
  // Find matching shortcut
  const matchedShortcut = WEBVIEW_SHORTCUTS.find(shortcut => 
    matchesShortcut(event, shortcut)
  );
  
  if (!matchedShortcut) {
    console.log('[WebView Preload] No matching shortcut for:', shortcutString);
    return;
  }
  
  console.log('[WebView Preload] Matched shortcut:', matchedShortcut.action, 'for', shortcutString);
  
  // Some shortcuts should work even in input fields
  const allowedInInputs = ['close-modal'];
  const isAllowedInInput = allowedInInputs.includes(matchedShortcut.action);
  
  // Don't trigger shortcuts when typing, unless it's an allowed shortcut
  if (isInInputField && !isAllowedInInput) {
    console.log('[WebView Preload] Shortcut blocked - in input field:', matchedShortcut.action);
    return;
  }
  
  // Prevent the website from handling this shortcut
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  
  console.log('[WebView Preload] Sending shortcut to main process:', matchedShortcut.action);
  
  // Send the shortcut to the main process
  ipcRenderer.send('keyboard-shortcut', {
    action: matchedShortcut.action,
    key: event.key,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    url: window.location.href,
    timestamp: Date.now()
  });
}

/**
 * Create a shortcut string from keyboard event (similar to debug tool)
 */
function createShortcutString(event) {
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  
  let key = event.key.toLowerCase();
  const keyMap = {
    ' ': 'space',
    'escape': 'escape',
    'arrowup': 'up',
    'arrowdown': 'down',
    'arrowleft': 'left',
    'arrowright': 'right',
    '+': 'plus',
    '-': 'minus',
    '=': 'equal',
    ',': 'comma',
  };
  
  key = keyMap[key] || key;
  parts.push(key);
  
  return parts.join('+');
}

// Set up keyboard event listener in capture phase (runs before website handlers)
document.addEventListener('keydown', handleKeyboardShortcut, true);

// Also listen for DOM ready to ensure we capture events as early as possible
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Re-attach listener to ensure it's active
    document.removeEventListener('keydown', handleKeyboardShortcut, true);
    document.addEventListener('keydown', handleKeyboardShortcut, true);
  });
}

// Debug: Log when preload script loads
console.log('[WebView Preload] Script executed!');
console.log('[WebView Preload] Script loaded with keyboard shortcut capture, electronAPI exposed');
