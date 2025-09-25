/**
 * BBZCloud - WebView Keyboard Shortcuts Handler
 * 
 * This hook provides an alternative solution for keyboard shortcuts that work
 * even when webviews have focus. It uses a combination of approaches:
 * 1. Electron main process global shortcuts
 * 2. WebView preload script injection
 * 3. IPC communication between renderer and main process
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.0.38
 */

import { useEffect, useRef } from 'react';
import { KEYBOARD_SHORTCUTS } from '../utils/constants';

/**
 * Hook for webview-aware keyboard shortcuts
 * 
 * This hook implements a multi-layered approach to ensure keyboard shortcuts
 * work regardless of where the focus is:
 * 1. Registers shortcuts with Electron's main process
 * 2. Injects keyboard event listeners into webviews
 * 3. Uses IPC to communicate shortcut events
 * 
 * @param {Object} handlers - Object containing handler functions
 * @param {boolean} enabled - Whether shortcuts are enabled
 */
export const useWebViewKeyboardShortcuts = (handlers = {}, enabled = true) => {
  const handlersRef = useRef(handlers);
  const registeredShortcutsRef = useRef(new Set());

  // Update handlers ref when props change
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled || !window.electron) {
      return;
    }

    // Define shortcuts that should work globally
    const globalShortcuts = {
      [KEYBOARD_SHORTCUTS.COMMAND_PALETTE]: handlers.onOpenCommandPalette,
      [KEYBOARD_SHORTCUTS.TOGGLE_TODO]: handlers.onToggleTodo,
      [KEYBOARD_SHORTCUTS.TOGGLE_SECURE_DOCS]: handlers.onToggleSecureDocs,
      [KEYBOARD_SHORTCUTS.OPEN_SETTINGS]: handlers.onOpenSettings,
      [KEYBOARD_SHORTCUTS.RELOAD_CURRENT]: handlers.onReloadCurrent,
      [KEYBOARD_SHORTCUTS.RELOAD_ALL]: handlers.onReloadAll,
      // Navigation shortcuts
      [KEYBOARD_SHORTCUTS.NAV_APP_1]: () => handlers.onNavigate?.(0),
      [KEYBOARD_SHORTCUTS.NAV_APP_2]: () => handlers.onNavigate?.(1),
      [KEYBOARD_SHORTCUTS.NAV_APP_3]: () => handlers.onNavigate?.(2),
      [KEYBOARD_SHORTCUTS.NAV_APP_4]: () => handlers.onNavigate?.(3),
      [KEYBOARD_SHORTCUTS.NAV_APP_5]: () => handlers.onNavigate?.(4),
      [KEYBOARD_SHORTCUTS.NAV_APP_6]: () => handlers.onNavigate?.(5),
      [KEYBOARD_SHORTCUTS.NAV_APP_7]: () => handlers.onNavigate?.(6),
      [KEYBOARD_SHORTCUTS.NAV_APP_8]: () => handlers.onNavigate?.(7),
      [KEYBOARD_SHORTCUTS.NAV_APP_9]: () => handlers.onNavigate?.(8),
    };

    // Register shortcuts with main process
    const registerShortcuts = async () => {
      try {
        for (const [shortcut, handler] of Object.entries(globalShortcuts)) {
          if (handler && typeof handler === 'function') {
            const success = await window.electron.registerGlobalShortcut(shortcut, handler);
            if (success) {
              registeredShortcutsRef.current.add(shortcut);
            }
          }
        }
      } catch (error) {
        console.error('Error registering global shortcuts:', error);
      }
    };

    // Setup webview keyboard event injection
    const setupWebViewKeyboardHandling = () => {
      // Listen for webview ready events
      const handleWebViewReady = (webviewId) => {
        const webview = document.querySelector(`#wv-${webviewId}`);
        if (webview) {
          // Inject keyboard event handler into webview
          webview.executeJavaScript(`
            (function() {
              // Prevent multiple injections
              if (window.__bbzcloudKeyboardHandlerInjected) return;
              window.__bbzcloudKeyboardHandlerInjected = true;

              // Define shortcuts that should be captured
              const shortcuts = {
                'ctrl+shift+p': 'COMMAND_PALETTE',
                'ctrl+shift+t': 'TOGGLE_TODO',
                'ctrl+d': 'TOGGLE_SECURE_DOCS',
                'ctrl+comma': 'OPEN_SETTINGS',
                'ctrl+r': 'RELOAD_CURRENT',
                'ctrl+shift+r': 'RELOAD_ALL',
                'ctrl+1': 'NAV_APP_1',
                'ctrl+2': 'NAV_APP_2',
                'ctrl+3': 'NAV_APP_3',
                'ctrl+4': 'NAV_APP_4',
                'ctrl+5': 'NAV_APP_5',
                'ctrl+6': 'NAV_APP_6',
                'ctrl+7': 'NAV_APP_7',
                'ctrl+8': 'NAV_APP_8',
                'ctrl+9': 'NAV_APP_9'
              };

              // Function to convert keyboard event to shortcut string
              function getShortcutString(event) {
                const parts = [];
                if (event.ctrlKey || event.metaKey) parts.push('ctrl');
                if (event.altKey) parts.push('alt');
                if (event.shiftKey) parts.push('shift');
                
                let key = event.key.toLowerCase();
                if (key === ',') key = 'comma';
                parts.push(key);
                
                return parts.join('+');
              }

              // Add keyboard event listener
              document.addEventListener('keydown', function(event) {
                const shortcutString = getShortcutString(event);
                const shortcutAction = shortcuts[shortcutString];
                
                if (shortcutAction) {
                  event.preventDefault();
                  event.stopPropagation();
                  
                  // Send message to main process
                  if (window.electronAPI && window.electronAPI.sendShortcut) {
                    window.electronAPI.sendShortcut(shortcutAction);
                  }
                }
              }, true); // Use capture phase to catch events early
            })();
          `).catch(error => {
            console.error('Error injecting keyboard handler into webview:', error);
          });
        }
      };

      // Listen for webview dom-ready events
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.tagName === 'WEBVIEW') {
              node.addEventListener('dom-ready', () => {
                const webviewId = node.id.replace('wv-', '');
                handleWebViewReady(webviewId);
              });
            }
          });
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Handle existing webviews
      document.querySelectorAll('webview').forEach(webview => {
        const webviewId = webview.id.replace('wv-', '');
        if (webview.src) {
          handleWebViewReady(webviewId);
        } else {
          webview.addEventListener('dom-ready', () => {
            handleWebViewReady(webviewId);
          });
        }
      });

      return () => observer.disconnect();
    };

    // Listen for shortcut messages from webviews
    const handleShortcutMessage = (shortcutAction) => {
      const handler = Object.entries(globalShortcuts).find(([key, _]) => 
        key.includes(shortcutAction.toLowerCase())
      )?.[1];
      
      if (handler && typeof handler === 'function') {
        handler();
      }
    };

    // Setup IPC listener for shortcut messages
    let unsubscribeShortcutListener;
    if (window.electron && window.electron.onShortcut) {
      unsubscribeShortcutListener = window.electron.onShortcut(handleShortcutMessage);
    }

    // Initialize everything
    registerShortcuts();
    const cleanupWebViewHandling = setupWebViewKeyboardHandling();

    // Cleanup function
    return () => {
      // Unregister global shortcuts
      registeredShortcutsRef.current.forEach(shortcut => {
        if (window.electron && window.electron.unregisterGlobalShortcut) {
          window.electron.unregisterGlobalShortcut(shortcut);
        }
      });
      registeredShortcutsRef.current.clear();

      // Cleanup webview handling
      if (cleanupWebViewHandling) {
        cleanupWebViewHandling();
      }

      // Cleanup IPC listener
      if (unsubscribeShortcutListener) {
        unsubscribeShortcutListener();
      }
    };
  }, [handlers, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (window.electron && window.electron.unregisterAllGlobalShortcuts) {
        window.electron.unregisterAllGlobalShortcuts();
      }
    };
  }, []);
};

/**
 * Hook for enhanced webview keyboard shortcuts with fallback
 * 
 * This hook provides a more robust solution that combines multiple approaches
 * to ensure keyboard shortcuts work in all scenarios.
 * 
 * @param {Object} handlers - Object containing handler functions
 * @param {boolean} enabled - Whether shortcuts are enabled
 */
export const useEnhancedWebViewShortcuts = (handlers = {}, enabled = true) => {
  const handlersRef = useRef(handlers);
  const registeredShortcutsRef = useRef(new Set());

  // Update handlers ref when props change
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  // Method 1: Electron global shortcuts (if available)
  useEffect(() => {
    if (!enabled || !window.electron) {
      return;
    }

    // Define shortcuts that should work globally
    const globalShortcuts = {
      [KEYBOARD_SHORTCUTS.COMMAND_PALETTE]: handlers.onOpenCommandPalette,
      [KEYBOARD_SHORTCUTS.TOGGLE_TODO]: handlers.onToggleTodo,
      [KEYBOARD_SHORTCUTS.TOGGLE_SECURE_DOCS]: handlers.onToggleSecureDocs,
      [KEYBOARD_SHORTCUTS.OPEN_SETTINGS]: handlers.onOpenSettings,
      [KEYBOARD_SHORTCUTS.RELOAD_CURRENT]: handlers.onReloadCurrent,
      [KEYBOARD_SHORTCUTS.RELOAD_ALL]: handlers.onReloadAll,
      // Navigation shortcuts
      [KEYBOARD_SHORTCUTS.NAV_APP_1]: () => handlers.onNavigate?.(0),
      [KEYBOARD_SHORTCUTS.NAV_APP_2]: () => handlers.onNavigate?.(1),
      [KEYBOARD_SHORTCUTS.NAV_APP_3]: () => handlers.onNavigate?.(2),
      [KEYBOARD_SHORTCUTS.NAV_APP_4]: () => handlers.onNavigate?.(3),
      [KEYBOARD_SHORTCUTS.NAV_APP_5]: () => handlers.onNavigate?.(4),
      [KEYBOARD_SHORTCUTS.NAV_APP_6]: () => handlers.onNavigate?.(5),
      [KEYBOARD_SHORTCUTS.NAV_APP_7]: () => handlers.onNavigate?.(6),
      [KEYBOARD_SHORTCUTS.NAV_APP_8]: () => handlers.onNavigate?.(7),
      [KEYBOARD_SHORTCUTS.NAV_APP_9]: () => handlers.onNavigate?.(8),
    };

    // Register shortcuts with main process (if available)
    const registerShortcuts = async () => {
      try {
        if (window.electron.registerGlobalShortcut) {
          for (const [shortcut, handler] of Object.entries(globalShortcuts)) {
            if (handler && typeof handler === 'function') {
              const success = await window.electron.registerGlobalShortcut(shortcut, handler);
              if (success) {
                registeredShortcutsRef.current.add(shortcut);
              }
            }
          }
        }
      } catch (error) {
        console.warn('Global shortcuts not available:', error);
      }
    };

    registerShortcuts();

    // Cleanup function
    return () => {
      // Unregister global shortcuts
      registeredShortcutsRef.current.forEach(shortcut => {
        if (window.electron && window.electron.unregisterGlobalShortcut) {
          try {
            window.electron.unregisterGlobalShortcut(shortcut);
          } catch (error) {
            console.warn('Error unregistering shortcut:', error);
          }
        }
      });
      registeredShortcutsRef.current.clear();
    };
  }, [handlers, enabled]);

  // Method 2: Document-level event listener with higher priority
  useEffect(() => {
    if (!enabled) return;

    const handleDocumentKeydown = (event) => {
      // Only handle if not in an input field
      const activeElement = document.activeElement;
      const isInputField = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true'
      );

      if (isInputField) return;

      const shortcutString = getShortcutString(event);
      
      // Handle specific shortcuts
      switch (shortcutString) {
        case KEYBOARD_SHORTCUTS.COMMAND_PALETTE:
          if (handlers.onOpenCommandPalette) {
            event.preventDefault();
            handlers.onOpenCommandPalette();
          }
          break;
        case KEYBOARD_SHORTCUTS.TOGGLE_TODO:
          if (handlers.onToggleTodo) {
            event.preventDefault();
            handlers.onToggleTodo();
          }
          break;
        case KEYBOARD_SHORTCUTS.TOGGLE_SECURE_DOCS:
          if (handlers.onToggleSecureDocs) {
            event.preventDefault();
            handlers.onToggleSecureDocs();
          }
          break;
        case KEYBOARD_SHORTCUTS.OPEN_SETTINGS:
          if (handlers.onOpenSettings) {
            event.preventDefault();
            handlers.onOpenSettings();
          }
          break;
        case KEYBOARD_SHORTCUTS.RELOAD_CURRENT:
          if (handlers.onReloadCurrent) {
            event.preventDefault();
            handlers.onReloadCurrent();
          }
          break;
        case KEYBOARD_SHORTCUTS.RELOAD_ALL:
          if (handlers.onReloadAll) {
            event.preventDefault();
            handlers.onReloadAll();
          }
          break;
        default:
          // No action for unrecognized shortcuts
          break;
      }
    };

    // Helper function to convert keyboard event to shortcut string
    const getShortcutString = (event) => {
      const parts = [];
      if (event.ctrlKey || event.metaKey) parts.push('ctrl');
      if (event.altKey) parts.push('alt');
      if (event.shiftKey) parts.push('shift');
      
      let key = event.key.toLowerCase();
      if (key === ',') key = 'comma';
      parts.push(key);
      
      return parts.join('+');
    };

    // Add high-priority event listener
    document.addEventListener('keydown', handleDocumentKeydown, true);

    return () => {
      document.removeEventListener('keydown', handleDocumentKeydown, true);
    };
  }, [handlers, enabled]);

  // Method 3: WebView script injection (if available)
  useEffect(() => {
    if (!enabled || !window.electron) {
      return;
    }

    // Setup webview keyboard event injection
    const setupWebViewKeyboardHandling = () => {
      // Listen for webview ready events
      const handleWebViewReady = (webviewId) => {
        const webview = document.querySelector(`#wv-${webviewId}`);
        if (webview && webview.executeJavaScript) {
          // Inject keyboard event handler into webview
          webview.executeJavaScript(`
            (function() {
              // Prevent multiple injections
              if (window.__bbzcloudKeyboardHandlerInjected) return;
              window.__bbzcloudKeyboardHandlerInjected = true;

              // Define shortcuts that should be captured
              const shortcuts = {
                'ctrl+shift+p': 'COMMAND_PALETTE',
                'ctrl+shift+t': 'TOGGLE_TODO',
                'ctrl+d': 'TOGGLE_SECURE_DOCS',
                'ctrl+comma': 'OPEN_SETTINGS',
                'ctrl+r': 'RELOAD_CURRENT',
                'ctrl+shift+r': 'RELOAD_ALL',
                'ctrl+1': 'NAV_APP_1',
                'ctrl+2': 'NAV_APP_2',
                'ctrl+3': 'NAV_APP_3',
                'ctrl+4': 'NAV_APP_4',
                'ctrl+5': 'NAV_APP_5',
                'ctrl+6': 'NAV_APP_6',
                'ctrl+7': 'NAV_APP_7',
                'ctrl+8': 'NAV_APP_8',
                'ctrl+9': 'NAV_APP_9'
              };

              // Function to convert keyboard event to shortcut string
              function getShortcutString(event) {
                const parts = [];
                if (event.ctrlKey || event.metaKey) parts.push('ctrl');
                if (event.altKey) parts.push('alt');
                if (event.shiftKey) parts.push('shift');
                
                let key = event.key.toLowerCase();
                if (key === ',') key = 'comma';
                parts.push(key);
                
                return parts.join('+');
              }

              // Add keyboard event listener
              document.addEventListener('keydown', function(event) {
                const shortcutString = getShortcutString(event);
                const shortcutAction = shortcuts[shortcutString];
                
                if (shortcutAction) {
                  event.preventDefault();
                  event.stopPropagation();
                  
                  // Send message to main process (if available)
                  if (window.electronAPI && window.electronAPI.sendShortcut) {
                    window.electronAPI.sendShortcut(shortcutAction);
                  }
                }
              }, true); // Use capture phase to catch events early
            })();
          `).catch(error => {
            console.warn('Error injecting keyboard handler into webview:', error);
          });
        }
      };

      // Listen for webview dom-ready events
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.tagName === 'WEBVIEW') {
              node.addEventListener('dom-ready', () => {
                const webviewId = node.id.replace('wv-', '');
                handleWebViewReady(webviewId);
              });
            }
          });
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Handle existing webviews
      document.querySelectorAll('webview').forEach(webview => {
        const webviewId = webview.id.replace('wv-', '');
        if (webview.src) {
          handleWebViewReady(webviewId);
        } else {
          webview.addEventListener('dom-ready', () => {
            handleWebViewReady(webviewId);
          });
        }
      });

      return () => observer.disconnect();
    };

    const cleanupWebViewHandling = setupWebViewKeyboardHandling();

    return () => {
      if (cleanupWebViewHandling) {
        cleanupWebViewHandling();
      }
    };
  }, [handlers, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (window.electron && window.electron.unregisterAllGlobalShortcuts) {
        try {
          window.electron.unregisterAllGlobalShortcuts();
        } catch (error) {
          console.warn('Error cleaning up global shortcuts:', error);
        }
      }
    };
  }, []);
};

export default useWebViewKeyboardShortcuts;
