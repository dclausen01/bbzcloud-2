/**
 * BBZCloud - WebContentsView Preload Script
 * 
 * This preload script runs in each WebContentsView and provides:
 * - Keyboard shortcut capture and forwarding
 * - Credential injection capabilities
 * - Communication bridge with main process
 * - Debug information collection
 * 
 * This is the modern replacement for browserview-preload.js, specifically
 * optimized for WebContentsView with improved performance and security.
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.1.0
 */

const { contextBridge, ipcRenderer } = require('electron');

// Get WebContentsView ID from command line arguments
const webContentsViewId = process.argv.find(arg => arg.startsWith('--webcontentsview-id='))?.split('=')[1] || 'unknown';

console.log(`[WebContentsView Preload] Loading for WebContentsView: ${webContentsViewId}`);

// Bridge critical errors to main process
const originalError = console.error;
console.error = (...args) => {
  originalError.apply(console, args);
  ipcRenderer.send('console-message', {
    method: 'error',
    args: args.map(arg => String(arg)),
    webContentsViewId
  });
};

// Expose protected methods for WebContentsView communication
contextBridge.exposeInMainWorld('electronWebContentsView', {
  // Get the WebContentsView ID
  getWebContentsViewId: () => webContentsViewId,
  
  // Send messages to main process
  send: (channel, data) => {
    const validChannels = [
      'webcontentsview-message',
      'keyboard-shortcut',
      'credential-request',
      'context-menu',
      'console-message'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, { ...data, webContentsViewId });
    }
  },

  // Listen for messages from main process
  on: (channel, callback) => {
    const validChannels = [
      'webcontentsview-command',
      'credential-response',
      'theme-changed',
      'inject-credentials'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, data) => {
        if (data.webContentsViewId === webContentsViewId || !data.webContentsViewId) {
          callback(data);
        }
      });
    }
  },

  // Remove listeners
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  }
});

// Backward compatibility: Also expose as electronBrowserView for existing code
contextBridge.exposeInMainWorld('electronBrowserView', {
  getBrowserViewId: () => webContentsViewId,
  send: (channel, data) => {
    // Map old channel names to new ones
    const channelMap = {
      'browserview-message': 'webcontentsview-message'
    };
    const mappedChannel = channelMap[channel] || channel;
    
    const validChannels = [
      'webcontentsview-message',
      'keyboard-shortcut',
      'credential-request',
      'context-menu',
      'console-message'
    ];
    if (validChannels.includes(mappedChannel)) {
      ipcRenderer.send(mappedChannel, { ...data, webContentsViewId, browserViewId: webContentsViewId });
    }
  },
  on: (channel, callback) => {
    const validChannels = [
      'webcontentsview-command',
      'credential-response',
      'theme-changed',
      'inject-credentials'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, data) => {
        if (data.webContentsViewId === webContentsViewId || data.browserViewId === webContentsViewId || !data.webContentsViewId) {
          callback(data);
        }
      });
    }
  },
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  }
});

// ============================================================================
// KEYBOARD SHORTCUT CAPTURE SYSTEM FOR WEBCONTENTSVIEWS
// ============================================================================

/**
 * WebContentsView-specific keyboard shortcuts
 * These are captured before websites can handle them
 */
const WEBCONTENTSVIEW_SHORTCUTS = [
  // Navigation shortcuts
  { key: 'F5', ctrlKey: false, altKey: false, shiftKey: false, action: 'browserview-refresh' },
  { key: 'ArrowLeft', ctrlKey: false, altKey: true, shiftKey: false, action: 'browserview-back' },
  { key: 'ArrowRight', ctrlKey: false, altKey: true, shiftKey: false, action: 'browserview-forward' },
  { key: 'r', ctrlKey: true, altKey: false, shiftKey: false, action: 'browserview-refresh' },
  
  // Utility shortcuts
  { key: 'p', ctrlKey: true, altKey: false, shiftKey: false, action: 'browserview-print' },
  { key: 'f', ctrlKey: true, altKey: false, shiftKey: false, action: 'browserview-find' },
  
  // Zoom shortcuts
  { key: '+', ctrlKey: true, altKey: false, shiftKey: false, action: 'browserview-zoom-in' },
  { key: '=', ctrlKey: true, altKey: false, shiftKey: false, action: 'browserview-zoom-in' },
  { key: '-', ctrlKey: true, altKey: false, shiftKey: false, action: 'browserview-zoom-out' },
  { key: '0', ctrlKey: true, altKey: false, shiftKey: false, action: 'browserview-zoom-reset' },
  
  // Global app shortcuts that should work from WebContentsViews
  { key: 'p', ctrlKey: true, altKey: false, shiftKey: true, action: 'command-palette' },
  { key: 't', ctrlKey: true, altKey: false, shiftKey: true, action: 'toggle-todo' },
  { key: 'd', ctrlKey: true, altKey: false, shiftKey: false, action: 'toggle-secure-docs' },
  { key: ',', ctrlKey: true, altKey: false, shiftKey: false, action: 'open-settings' },
  
  // Navigation shortcuts (Ctrl+1-9)
  { key: '1', ctrlKey: true, altKey: false, shiftKey: false, action: 'nav-app-1' },
  { key: '2', ctrlKey: true, altKey: false, shiftKey: false, action: 'nav-app-2' },
  { key: '3', ctrlKey: true, altKey: false, shiftKey: false, action: 'nav-app-3' },
  { key: '4', ctrlKey: true, altKey: false, shiftKey: false, action: 'nav-app-4' },
  { key: '5', ctrlKey: true, altKey: false, shiftKey: false, action: 'nav-app-5' },
  { key: '6', ctrlKey: true, altKey: false, shiftKey: false, action: 'nav-app-6' },
  { key: '7', ctrlKey: true, altKey: false, shiftKey: false, action: 'nav-app-7' },
  { key: '8', ctrlKey: true, altKey: false, shiftKey: false, action: 'nav-app-8' },
  { key: '9', ctrlKey: true, altKey: false, shiftKey: false, action: 'nav-app-9' },
  
  // Modal/overlay shortcuts (should work even in input fields)
  { key: 'Escape', ctrlKey: false, altKey: false, shiftKey: false, action: 'close-modal' },
  
  // Reload shortcuts
  { key: 'F5', ctrlKey: true, altKey: false, shiftKey: false, action: 'reload-current' },
  { key: 'r', ctrlKey: true, altKey: false, shiftKey: true, action: 'reload-all' },
  
  // Fullscreen
  { key: 'F11', ctrlKey: false, altKey: false, shiftKey: false, action: 'toggle-fullscreen' }
];

/**
 * Check if the current element is an input field
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
  // Normalize key names
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
 * Create a shortcut string from keyboard event for debugging
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
    'f5': 'f5',
    'f11': 'f11'
  };
  
  key = keyMap[key] || key;
  parts.push(key);
  
  return parts.join('+');
}

/**
 * Main keyboard event handler for WebContentsView shortcuts
 */
function handleKeyboardShortcut(event) {
  const activeElement = document.activeElement;
  const isInInputField = isInputField(activeElement);
  const shortcutString = createShortcutString(event);
  
  // Always send debug information for the debug tool
  if (window.electronWebContentsView) {
    window.electronWebContentsView.send('webcontentsview-message', {
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
  }
  
  // Find matching shortcut
  const matchedShortcut = WEBCONTENTSVIEW_SHORTCUTS.find(shortcut => 
    matchesShortcut(event, shortcut)
  );
  
  if (!matchedShortcut) {
    return; // No matching shortcut
  }
  
  console.log(`[WebContentsView Preload] Matched shortcut: ${matchedShortcut.action} for ${shortcutString}`);
  
  // Some shortcuts should work even in input fields
  const allowedInInputs = ['close-modal', 'toggle-fullscreen'];
  const isAllowedInInput = allowedInInputs.includes(matchedShortcut.action);
  
  // Don't trigger shortcuts when typing, unless it's an allowed shortcut
  if (isInInputField && !isAllowedInInput) {
    console.log(`[WebContentsView Preload] Shortcut blocked - in input field: ${matchedShortcut.action}`);
    return;
  }
  
  // Prevent the website from handling this shortcut
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  
  console.log(`[WebContentsView Preload] Sending shortcut to main process: ${matchedShortcut.action}`);
  
  // Send the shortcut to the main process
  if (window.electronWebContentsView) {
    window.electronWebContentsView.send('keyboard-shortcut', {
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
}

// ============================================================================
// CREDENTIAL INJECTION SYSTEM (Reuse from browserview-preload.js)
// ============================================================================

/**
 * Credential injection utilities for different services
 */
const CredentialInjector = {
  /**
   * Inject credentials for WebUntis
   */
  async injectWebUntisCredentials(email, password) {
    try {
      console.log('[WebContentsView Preload] Injecting WebUntis credentials');
      
      // Wait for form to be ready
      await CredentialInjector.waitForElement('.un2-login-form form');
      
      const form = document.querySelector('.un2-login-form form');
      const usernameField = form.querySelector('input[type="text"].un-input-group__input');
      const passwordField = form.querySelector('input[type="password"].un-input-group__input');
      const submitButton = form.querySelector('button[type="submit"]');
      
      if (!usernameField || !passwordField || !submitButton) {
        throw new Error('WebUntis form elements not found');
      }
      
      // Fill credentials using React event simulation
      this.fillReactInput(usernameField, email);
      await this.sleep(100);
      this.fillReactInput(passwordField, password);
      await this.sleep(500);
      
      // Submit form if button is enabled
      if (!submitButton.disabled) {
        submitButton.click();
        
        // Wait and check for authenticator page
        await this.sleep(2000);
        const authLabel = document.querySelector('.un-input-group__label');
        if (authLabel?.textContent !== 'Bestätigungscode') {
          window.location.reload();
        }
      }
      
      return true;
    } catch (error) {
      console.error('[WebContentsView Preload] WebUntis credential injection failed:', error);
      return false;
    }
  },

  /**
   * Inject credentials for SchulCloud
   */
  async injectSchulCloudCredentials(email, password) {
    try {
      console.log('[WebContentsView Preload] Injecting SchulCloud credentials');
      
      const emailInput = document.querySelector('input#username[type="text"]');
      const passwordInput = document.querySelector('input[type="password"]');
      const weiterButton = document.querySelector('button[type="submit"].btn.btn-contained');
      const loginButton = Array.from(document.querySelectorAll('span.header')).find(el => 
        el.textContent.includes('Anmelden mit Passwort')
      );
      
      // Check if already logged in
      const loggedIn = document.querySelector('.user-menu') ||
                     document.querySelector('.dashboard') ||
                     document.querySelector('.main-content') ||
                     document.body.textContent.includes('Abmelden');
      
      if (loggedIn) return true;
      
      if (emailInput && !passwordInput) {
        // Email page
        this.fillAngularInput(emailInput, email);
        await this.sleep(1000);
        if (weiterButton) weiterButton.click();
      } else if (passwordInput) {
        // Password page - exclude encryption password field
        const allPasswordInputs = document.querySelectorAll('input[type="password"]');
        let loginPasswordInput = null;
        
        for (const input of allPasswordInputs) {
          const parentAppLabel = input.closest('app-label-input');
          const hasEncryptionTestId = parentAppLabel?.getAttribute('data-test-id') === 'set-private-key-password_pass_if';
          const hasEncryptionLabel = parentAppLabel?.textContent.includes('Verschlüsselungskennwort');
          
          if (!hasEncryptionTestId && !hasEncryptionLabel) {
            loginPasswordInput = input;
            break;
          }
        }
        
        if (loginPasswordInput) {
          this.fillAngularInput(loginPasswordInput, password);
          
          // Click remember login checkbox
          const rememberCheckbox = document.querySelector('app-icon[icon="check"]');
          if (rememberCheckbox) rememberCheckbox.click();
          
          await this.sleep(1000);
          if (loginButton) loginButton.click();
        }
      }
      
      return true;
    } catch (error) {
      console.error('[WebContentsView Preload] SchulCloud credential injection failed:', error);
      return false;
    }
  },

  /**
   * Inject credentials for Office.com
   */
  async injectOfficeCredentials(email, password) {
    try {
      console.log('[WebContentsView Preload] Injecting Office credentials');
      
      const emailInput = document.querySelector('input[name="loginfmt"]#i0116[type="email"]');
      const passwordInput = document.querySelector('input[name="passwd"]#i0118[type="password"]');
      const weiterButton = document.querySelector('input[type="submit"]#idSIButton9[value="Weiter"]');
      const anmeldenButton = document.querySelector('input[type="submit"]#idSIButton9[value="Anmelden"]');
      const jaButton = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');
      const emailTile = document.querySelector('div[data-bind*="session.tileDisplayName"]');
      
      // Check if already logged in
      const officeApps = document.querySelector('.o365cs-nav-appTitle, .ms-Nav, .od-TopBar, [data-automation-id="appLauncher"]');
      if (officeApps) return true;
      
      if (emailInput && !passwordInput) {
        // Email page
        this.fillMicrosoftInput(emailInput, email);
        await this.sleep(1000);
        if (weiterButton) weiterButton.click();
      } else if (emailTile && !passwordInput) {
        // Account selection page
        const clickableParent = this.findClickableParent(emailTile);
        if (clickableParent) clickableParent.click();
      } else if (passwordInput) {
        // Password page
        this.fillMicrosoftInput(passwordInput, password);
        await this.sleep(1000);
        if (anmeldenButton) anmeldenButton.click();
      } else if (jaButton) {
        // "Stay signed in?" page
        await this.sleep(500);
        jaButton.click();
      }
      
      return true;
    } catch (error) {
      console.error('[WebContentsView Preload] Office credential injection failed:', error);
      return false;
    }
  },

  /**
   * Inject credentials for Moodle
   */
  async injectMoodleCredentials(email, password) {
    try {
      console.log('[WebContentsView Preload] Injecting Moodle credentials');
      
      const usernameField = document.querySelector('input[name="username"][id="username"]');
      const passwordField = document.querySelector('input[name="password"][id="password"]');
      const loginButton = document.querySelector('button[type="submit"][id="loginbtn"]');
      
      if (usernameField && passwordField && loginButton) {
        usernameField.value = email.toLowerCase();
        passwordField.value = password;
        
        // Trigger events
        usernameField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        
        loginButton.click();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[WebContentsView Preload] Moodle credential injection failed:', error);
      return false;
    }
  },

  /**
   * Helper methods for credential injection
   */
  async waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  fillReactInput(input, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(input, value);
    
    const event = new Event('input', { bubbles: true });
    input.dispatchEvent(event);
  },

  fillAngularInput(input, value) {
    input.value = value;
    input.focus();
    
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  },

  fillMicrosoftInput(input, value) {
    input.value = value;
    input.focus();
    
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  },

  findClickableParent(element) {
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      if (parent.tagName === 'BUTTON' || 
          parent.onclick || 
          parent.getAttribute('role') === 'button' ||
          parent.style.cursor === 'pointer' ||
          parent.classList.contains('tile') ||
          parent.classList.contains('account')) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return element;
  }
};

// ============================================================================
// EVENT LISTENERS AND INITIALIZATION
// ============================================================================

// Set up keyboard event listener in capture phase
document.addEventListener('keydown', handleKeyboardShortcut, true);

// Listen for credential injection requests
if (window.electronWebContentsView) {
  window.electronWebContentsView.on('inject-credentials', async (data) => {
    const { service, credentials } = data;
    
    console.log(`[WebContentsView Preload] Received credential injection request for: ${service}`);
    
    let success = false;
    
    switch (service.toLowerCase()) {
      case 'webuntis':
        success = await CredentialInjector.injectWebUntisCredentials(
          credentials.webuntisEmail || credentials.email,
          credentials.webuntisPassword || credentials.password
        );
        break;
        
      case 'schulcloud':
        success = await CredentialInjector.injectSchulCloudCredentials(
          credentials.email,
          credentials.password
        );
        break;
        
      case 'office':
        success = await CredentialInjector.injectOfficeCredentials(
          credentials.email,
          credentials.password
        );
        break;
        
      case 'moodle':
        success = await CredentialInjector.injectMoodleCredentials(
          credentials.email,
          credentials.password
        );
        break;
        
      default:
        console.warn(`[WebContentsView Preload] Unknown service for credential injection: ${service}`);
    }
    
    // Send response back to main process
    window.electronWebContentsView.send('credential-response', {
      service,
      success,
      timestamp: Date.now()
    });
  });
}

// Re-attach keyboard listener after DOM ready to ensure it's active
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    document.removeEventListener('keydown', handleKeyboardShortcut, true);
    document.addEventListener('keydown', handleKeyboardShortcut, true);
    console.log('[WebContentsView Preload] Keyboard listener re-attached after DOM ready');
  });
}

// Debug logging
console.log(`[WebContentsView Preload] Script loaded for WebContentsView: ${webContentsViewId}`);
console.log('[WebContentsView Preload] Keyboard shortcut capture and credential injection ready');
