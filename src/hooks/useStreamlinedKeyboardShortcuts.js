/**
 * BBZCloud - Streamlined Keyboard Shortcuts Hook
 * 
 * This hook consolidates all keyboard shortcut functionality into a single,
 * efficient implementation that replaces the multiple overlapping hooks.
 * It provides a clean, maintainable solution for all keyboard shortcut needs.
 * 
 * FEATURES:
 * - Single source of truth for all keyboard shortcuts
 * - Works in all contexts (main app, webviews, modals)
 * - Prevents conflicts and duplicate event listeners
 * - Optimized performance with minimal overhead
 * - Cross-platform compatibility (Windows/Mac)
 * - Smart input field detection
 * - WebView script injection for enhanced functionality
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.0.39
 */

import { useEffect, useCallback, useRef } from 'react';
import { KEYBOARD_SHORTCUTS } from '../utils/constants';

/**
 * Streamlined keyboard shortcuts hook
 * 
 * This hook manages all keyboard shortcuts in one place to prevent conflicts
 * and ensure reliable operation across different focus contexts.
 * 
 * @param {Object} config - Configuration object
 * @param {Object} config.handlers - All handler functions for shortcuts
 * @param {Array} config.navigationItems - Navigation items for Ctrl+1-9 shortcuts
 * @param {Object} config.modalStates - States of modals/drawers for escape handling
 * @param {Object} config.webViewRef - Reference to webview container
 * @param {boolean} config.enabled - Whether shortcuts are enabled
 */
export const useStreamlinedKeyboardShortcuts = ({
  handlers = {},
  navigationItems = [],
  modalStates = {},
  webViewRef = null,
  enabled = true
}) => {
  const handlersRef = useRef(handlers);
  const navigationItemsRef = useRef(navigationItems);
  const modalStatesRef = useRef(modalStates);
  const webViewRefRef = useRef(webViewRef);

  // Update refs when props change to avoid stale closures
  useEffect(() => {
    handlersRef.current = handlers;
    navigationItemsRef.current = navigationItems;
    modalStatesRef.current = modalStates;
    webViewRefRef.current = webViewRef;
  }, [handlers, navigationItems, modalStates, webViewRef]);

  /**
   * Convert keyboard event to shortcut string
   * Handles cross-platform differences and special keys
   */
  const getShortcutString = useCallback((event) => {
    const parts = [];
    
    // Handle modifier keys (order matters for consistency)
    if (event.ctrlKey || event.metaKey) parts.push('ctrl'); // Map Mac Cmd to Ctrl
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    
    // Get the main key and normalize it
    let key = event.key.toLowerCase();
    
    // Map special keys to consistent names
    const keyMap = {
      ' ': 'space',
      'escape': 'escape',
      'enter': 'enter',
      'tab': 'tab',
      'arrowup': 'up',
      'arrowdown': 'down',
      'arrowleft': 'left',
      'arrowright': 'right',
      'f1': 'f1', 'f2': 'f2', 'f3': 'f3', 'f4': 'f4',
      'f5': 'f5', 'f6': 'f6', 'f7': 'f7', 'f8': 'f8',
      'f9': 'f9', 'f10': 'f10', 'f11': 'f11', 'f12': 'f12',
      '+': 'plus',
      '-': 'minus',
      ',': 'comma',
      '.': 'period',
      '/': 'slash',
      '\\': 'backslash',
      '[': 'bracketleft',
      ']': 'bracketright',
      ';': 'semicolon',
      "'": 'quote',
      '`': 'backquote',
      '=': 'equal',
    };
    
    key = keyMap[key] || key;
    parts.push(key);
    
    return parts.join('+');
  }, []);

  /**
   * Check if user is typing in an input field
   * Prevents shortcuts from firing when user is entering text
   */
  const isTypingInInput = useCallback(() => {
    const activeElement = document.activeElement;
    return activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.contentEditable === 'true' ||
      activeElement.isContentEditable ||
      activeElement.tagName === 'WEBVIEW' // Add webview check
    );
  }, []);

  /**
   * Main keyboard event handler
   * Processes all keyboard events and routes them to appropriate handlers
   */
  const handleKeyDown = useCallback((event) => {
    if (!enabled) return;

    const shortcut = getShortcutString(event);
    const isInInput = isTypingInInput();
    const currentHandlers = handlersRef.current;
    const currentNavigationItems = navigationItemsRef.current;
    const currentModalStates = modalStatesRef.current;
    const currentWebViewRef = webViewRefRef.current;

    // Allow escape key even when typing (for closing modals)
    if (shortcut === 'escape') {
      // Check if any modal is open and close it (priority order)
      if (currentModalStates.isCommandPaletteOpen && currentHandlers.onCommandPaletteClose) {
        event.preventDefault();
        currentHandlers.onCommandPaletteClose();
        return;
      }
      if (currentModalStates.isSettingsOpen && currentHandlers.onSettingsClose) {
        event.preventDefault();
        currentHandlers.onSettingsClose();
        return;
      }
      if (currentModalStates.isTodoOpen && currentHandlers.onTodoClose) {
        event.preventDefault();
        currentHandlers.onTodoClose();
        return;
      }
      if (currentModalStates.isSecureDocsOpen && currentHandlers.onSecureDocsClose) {
        event.preventDefault();
        currentHandlers.onSecureDocsClose();
        return;
      }
    }

    // Don't handle other shortcuts when typing in input fields
    if (isInInput && shortcut !== 'escape') return;

    let handled = false;

    // Handle application shortcuts
    switch (shortcut) {
      case KEYBOARD_SHORTCUTS.COMMAND_PALETTE:
        if (currentHandlers.onOpenCommandPalette) {
          event.preventDefault();
          currentHandlers.onOpenCommandPalette();
          handled = true;
        }
        break;

      case KEYBOARD_SHORTCUTS.TOGGLE_TODO:
        if (currentHandlers.onToggleTodo) {
          event.preventDefault();
          currentHandlers.onToggleTodo();
          handled = true;
        }
        break;

      case KEYBOARD_SHORTCUTS.TOGGLE_SECURE_DOCS:
        if (currentHandlers.onToggleSecureDocs) {
          event.preventDefault();
          currentHandlers.onToggleSecureDocs();
          handled = true;
        }
        break;

      case KEYBOARD_SHORTCUTS.OPEN_SETTINGS:
        if (currentHandlers.onOpenSettings) {
          event.preventDefault();
          currentHandlers.onOpenSettings();
          handled = true;
        }
        break;

      case KEYBOARD_SHORTCUTS.RELOAD_CURRENT:
        if (currentHandlers.onReloadCurrent) {
          event.preventDefault();
          currentHandlers.onReloadCurrent();
          handled = true;
        }
        break;

      case KEYBOARD_SHORTCUTS.RELOAD_ALL:
        if (currentHandlers.onReloadAll) {
          event.preventDefault();
          currentHandlers.onReloadAll();
          handled = true;
        }
        break;

      case KEYBOARD_SHORTCUTS.TOGGLE_FULLSCREEN:
        if (currentHandlers.onToggleFullscreen) {
          event.preventDefault();
          currentHandlers.onToggleFullscreen();
          handled = true;
        }
        break;

      // Navigation shortcuts (Ctrl+1-9)
      case 'ctrl+1':
      case 'ctrl+2':
      case 'ctrl+3':
      case 'ctrl+4':
      case 'ctrl+5':
      case 'ctrl+6':
      case 'ctrl+7':
      case 'ctrl+8':
      case 'ctrl+9':
        const index = parseInt(shortcut.split('+')[1]) - 1;
        if (currentNavigationItems[index] && currentHandlers.onNavigate) {
          event.preventDefault();
          currentHandlers.onNavigate(currentNavigationItems[index]);
          handled = true;
        }
        break;

      // WebView shortcuts
      case KEYBOARD_SHORTCUTS.WEBVIEW_BACK:
        if (currentWebViewRef && typeof currentWebViewRef.goBack === 'function') {
          event.preventDefault();
          try {
            currentWebViewRef.goBack();
            handled = true;
          } catch (error) {
            console.warn('Error navigating back:', error);
          }
        }
        break;

      case KEYBOARD_SHORTCUTS.WEBVIEW_FORWARD:
        if (currentWebViewRef && typeof currentWebViewRef.goForward === 'function') {
          event.preventDefault();
          try {
            currentWebViewRef.goForward();
            handled = true;
          } catch (error) {
            console.warn('Error navigating forward:', error);
          }
        }
        break;

      case KEYBOARD_SHORTCUTS.WEBVIEW_REFRESH:
        if (currentWebViewRef && typeof currentWebViewRef.reload === 'function') {
          event.preventDefault();
          try {
            currentWebViewRef.reload();
            handled = true;
          } catch (error) {
            console.warn('Error reloading webview:', error);
          }
        }
        break;

      case KEYBOARD_SHORTCUTS.PRINT:
        if (currentWebViewRef && typeof currentWebViewRef.print === 'function') {
          event.preventDefault();
          try {
            currentWebViewRef.print();
            handled = true;
          } catch (error) {
            console.warn('Error printing webview:', error);
          }
        }
        break;

      // Zoom shortcuts
      case KEYBOARD_SHORTCUTS.WEBVIEW_ZOOM_IN:
        if (currentWebViewRef && typeof currentWebViewRef.setZoomLevel === 'function') {
          event.preventDefault();
          try {
            const currentZoom = currentWebViewRef.getZoomLevel();
            currentWebViewRef.setZoomLevel(Math.min(currentZoom + 0.5, 3));
            handled = true;
          } catch (error) {
            console.warn('Error zooming in:', error);
          }
        }
        break;

      case KEYBOARD_SHORTCUTS.WEBVIEW_ZOOM_OUT:
        if (currentWebViewRef && typeof currentWebViewRef.setZoomLevel === 'function') {
          event.preventDefault();
          try {
            const currentZoom = currentWebViewRef.getZoomLevel();
            currentWebViewRef.setZoomLevel(Math.max(currentZoom - 0.5, -3));
            handled = true;
          } catch (error) {
            console.warn('Error zooming out:', error);
          }
        }
        break;

      case KEYBOARD_SHORTCUTS.WEBVIEW_ZOOM_RESET:
        if (currentWebViewRef && typeof currentWebViewRef.setZoomLevel === 'function') {
          event.preventDefault();
          try {
            currentWebViewRef.setZoomLevel(0);
            handled = true;
          } catch (error) {
            console.warn('Error resetting zoom:', error);
          }
        }
        break;

      default:
        // Handle any unrecognized shortcuts - no action needed
        // This prevents the switch statement from falling through
        break;
    }

    // If we handled the shortcut, stop propagation
    if (handled) {
      event.stopPropagation();
    }
  }, [enabled, getShortcutString, isTypingInInput]);

  // Set up main event listener
  useEffect(() => {
    if (!enabled) return;

    // Use capture phase to ensure we get events before other handlers
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleKeyDown, enabled]);

  // Setup webview injection for enhanced shortcuts
  useEffect(() => {
    if (!enabled || !window.electron) return;

    const setupWebViewKeyboardHandling = () => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.tagName === 'WEBVIEW') {
              node.addEventListener('dom-ready', () => {
                injectKeyboardHandler(node);
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
        if (webview.src) {
          injectKeyboardHandler(webview);
        } else {
          webview.addEventListener('dom-ready', () => {
            injectKeyboardHandler(webview);
          });
        }
      });

      return () => observer.disconnect();
    };

    const injectKeyboardHandler = (webview) => {
      if (!webview.executeJavaScript) return;

      // Add a small delay to ensure webview is fully ready
      setTimeout(() => {
        webview.executeJavaScript(`
          (function() {
            if (window.__bbzcloudKeyboardHandlerInjected) return;
            window.__bbzcloudKeyboardHandlerInjected = true;

            const shortcuts = {
              'ctrl+shift+p': 'COMMAND_PALETTE',
              'ctrl+shift+t': 'TOGGLE_TODO',
              'ctrl+d': 'TOGGLE_SECURE_DOCS',
              'ctrl+comma': 'OPEN_SETTINGS',
              'ctrl+r': 'RELOAD_CURRENT',
              'ctrl+shift+r': 'RELOAD_ALL',
              'f11': 'TOGGLE_FULLSCREEN',
              'ctrl+1': 'NAV_1', 'ctrl+2': 'NAV_2', 'ctrl+3': 'NAV_3',
              'ctrl+4': 'NAV_4', 'ctrl+5': 'NAV_5', 'ctrl+6': 'NAV_6',
              'ctrl+7': 'NAV_7', 'ctrl+8': 'NAV_8', 'ctrl+9': 'NAV_9',
              'alt+left': 'WEBVIEW_BACK',
              'alt+right': 'WEBVIEW_FORWARD',
              'f5': 'WEBVIEW_REFRESH',
              'ctrl+p': 'PRINT',
              'ctrl+plus': 'WEBVIEW_ZOOM_IN',
              'ctrl+minus': 'WEBVIEW_ZOOM_OUT',
              'ctrl+0': 'WEBVIEW_ZOOM_RESET'
            };

            function getShortcutString(event) {
              const parts = [];
              if (event.ctrlKey || event.metaKey) parts.push('ctrl');
              if (event.altKey) parts.push('alt');
              if (event.shiftKey) parts.push('shift');
              
              let key = event.key.toLowerCase();
              const keyMap = {
                ',': 'comma',
                '+': 'plus',
                '-': 'minus',
                '=': 'plus' // Handle = key as plus for zoom
              };
              key = keyMap[key] || key;
              parts.push(key);
              
              return parts.join('+');
            }

            function isTypingInInput() {
              const activeElement = document.activeElement;
              return activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.contentEditable === 'true' ||
                activeElement.isContentEditable
              );
            }

            // Add event listener with high priority (capture phase)
            document.addEventListener('keydown', function(event) {
              // Don't handle shortcuts when typing in input fields (except escape)
              if (isTypingInInput() && event.key !== 'Escape') return;
              
              const shortcutString = getShortcutString(event);
              const shortcutAction = shortcuts[shortcutString];
              
              if (shortcutAction) {
                event.preventDefault();
                event.stopPropagation();
                
                // Send message to main process via IPC with fallbacks
                try {
                  // Method 1: Use electronAPI (simple API for webview content)
                  if (window.electronAPI && window.electronAPI.sendShortcut) {
                    window.electronAPI.sendShortcut(shortcutAction);
                    console.log('[WebView Shortcut] Sent via electronAPI:', shortcutAction);
                  }
                  // Method 2: Use full electron API
                  else if (window.electron && window.electron.sendShortcut) {
                    window.electron.sendShortcut(shortcutAction, shortcutString);
                    console.log('[WebView Shortcut] Sent via electron API:', shortcutAction);
                  }
                  // Method 3: PostMessage to parent (fallback)
                  else if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                      type: 'keyboard-shortcut',
                      action: shortcutAction,
                      shortcut: shortcutString
                    }, '*');
                    console.log('[WebView Shortcut] Sent via postMessage:', shortcutAction);
                  }
                  // Method 4: Try to access parent directly (if same origin)
                  else if (window.parent && window.parent.handleWebViewShortcut) {
                    window.parent.handleWebViewShortcut(shortcutAction, shortcutString);
                    console.log('[WebView Shortcut] Sent via parent function:', shortcutAction);
                  }
                  // Method 5: Custom event on document (last resort)
                  else {
                    const customEvent = new CustomEvent('bbzcloud-shortcut', {
                      detail: { action: shortcutAction, shortcut: shortcutString }
                    });
                    document.dispatchEvent(customEvent);
                    console.log('[WebView Shortcut] Sent via custom event:', shortcutAction);
                  }
                  
                } catch (e) {
                  console.warn('[WebView Shortcut] Could not send keyboard shortcut message:', e);
                }
              }
            }, true); // Use capture phase for higher priority
            
            // Also listen for focus events to re-inject if needed
            window.addEventListener('focus', function() {
              if (!window.__bbzcloudKeyboardHandlerInjected) {
                window.__bbzcloudKeyboardHandlerInjected = true;
              }
            });
            
            console.log('BBZCloud streamlined keyboard shortcuts injected successfully');
          })();
        `).catch(error => {
          console.warn('Error injecting keyboard handler into webview:', error);
          // Retry injection after a delay
          setTimeout(() => {
            injectKeyboardHandler(webview);
          }, 1000);
        });
      }, 500);
    };

    // Listen for messages from webviews
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'keyboard-shortcut') {
        const { action, shortcut } = event.data;
        const currentHandlers = handlersRef.current;
        const currentNavigationItems = navigationItemsRef.current;

        switch (action) {
          case 'COMMAND_PALETTE':
            currentHandlers.onOpenCommandPalette?.();
            break;
          case 'TOGGLE_TODO':
            currentHandlers.onToggleTodo?.();
            break;
          case 'TOGGLE_SECURE_DOCS':
            currentHandlers.onToggleSecureDocs?.();
            break;
          case 'OPEN_SETTINGS':
            currentHandlers.onOpenSettings?.();
            break;
          case 'RELOAD_CURRENT':
            currentHandlers.onReloadCurrent?.();
            break;
          case 'RELOAD_ALL':
            currentHandlers.onReloadAll?.();
            break;
          case 'TOGGLE_FULLSCREEN':
            currentHandlers.onToggleFullscreen?.();
            break;
          case 'WEBVIEW_BACK':
          case 'WEBVIEW_FORWARD':
          case 'WEBVIEW_REFRESH':
          case 'PRINT':
          case 'WEBVIEW_ZOOM_IN':
          case 'WEBVIEW_ZOOM_OUT':
          case 'WEBVIEW_ZOOM_RESET':
            // These are handled by the webview itself, no need to relay
            break;
      default:
        if (action.startsWith('NAV_')) {
          const index = parseInt(action.split('_')[1]) - 1;
          if (currentNavigationItems[index] && currentHandlers.onNavigate) {
            currentHandlers.onNavigate(currentNavigationItems[index]);
          }
        }
        break;
        }
      }
    };

    // Listen for shortcut events from main process (IPC)
    let unsubscribeShortcutListener;
    if (window.electron && window.electron.onShortcut) {
      unsubscribeShortcutListener = window.electron.onShortcut(({ action, shortcut }) => {
        console.log('[Streamlined Shortcuts] Received IPC shortcut:', { action, shortcut });
        const currentHandlers = handlersRef.current;
        const currentNavigationItems = navigationItemsRef.current;

        switch (action) {
          case 'COMMAND_PALETTE':
            currentHandlers.onOpenCommandPalette?.();
            break;
          case 'TOGGLE_TODO':
            currentHandlers.onToggleTodo?.();
            break;
          case 'TOGGLE_SECURE_DOCS':
            currentHandlers.onToggleSecureDocs?.();
            break;
          case 'OPEN_SETTINGS':
            currentHandlers.onOpenSettings?.();
            break;
          case 'RELOAD_CURRENT':
            currentHandlers.onReloadCurrent?.();
            break;
          case 'RELOAD_ALL':
            currentHandlers.onReloadAll?.();
            break;
          case 'TOGGLE_FULLSCREEN':
            currentHandlers.onToggleFullscreen?.();
            break;
          default:
            if (action.startsWith('NAV_')) {
              const index = parseInt(action.split('_')[1]) - 1;
              if (currentNavigationItems[index] && currentHandlers.onNavigate) {
                currentHandlers.onNavigate(currentNavigationItems[index]);
              }
            }
            break;
        }
      });
    }

    window.addEventListener('message', handleMessage);
    const cleanupWebViewHandling = setupWebViewKeyboardHandling();

    return () => {
      window.removeEventListener('message', handleMessage);
      if (cleanupWebViewHandling) {
        cleanupWebViewHandling();
      }
      if (unsubscribeShortcutListener) {
        unsubscribeShortcutListener();
      }
    };
  }, [enabled]);
};

/**
 * Utility function to get human-readable shortcut descriptions
 * Converts internal shortcut strings to user-friendly format
 */
export const getShortcutDescription = (shortcut) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  return shortcut
    .replace('ctrl', isMac ? '⌘' : 'Ctrl')
    .replace('alt', isMac ? '⌥' : 'Alt')
    .replace('shift', isMac ? '⇧' : 'Shift')
    .replace('comma', ',')
    .replace('plus', '+')
    .replace('minus', '-')
    .replace(/\+/g, isMac ? '' : '+')
    .toUpperCase();
};

/**
 * Get all available shortcuts with descriptions
 * Useful for help dialogs and settings panels
 */
export const getAllShortcuts = () => {
  return [
    {
      category: 'Application',
      shortcuts: [
        { key: KEYBOARD_SHORTCUTS.COMMAND_PALETTE, description: 'Open Command Palette', action: 'Command Palette' },
        { key: KEYBOARD_SHORTCUTS.TOGGLE_TODO, description: 'Toggle Todo List', action: 'Todo List' },
        { key: KEYBOARD_SHORTCUTS.TOGGLE_SECURE_DOCS, description: 'Toggle Secure Documents', action: 'Secure Documents' },
        { key: KEYBOARD_SHORTCUTS.OPEN_SETTINGS, description: 'Open Settings', action: 'Settings' },
        { key: KEYBOARD_SHORTCUTS.RELOAD_CURRENT, description: 'Reload Current Page', action: 'Reload Current' },
        { key: KEYBOARD_SHORTCUTS.RELOAD_ALL, description: 'Reload All Pages', action: 'Reload All' },
        { key: KEYBOARD_SHORTCUTS.TOGGLE_FULLSCREEN, description: 'Toggle Fullscreen', action: 'Fullscreen' },
      ]
    },
    {
      category: 'Navigation',
      shortcuts: [
        { key: 'ctrl+1', description: 'Go to First App', action: 'App 1' },
        { key: 'ctrl+2', description: 'Go to Second App', action: 'App 2' },
        { key: 'ctrl+3', description: 'Go to Third App', action: 'App 3' },
        { key: 'ctrl+4', description: 'Go to Fourth App', action: 'App 4' },
        { key: 'ctrl+5', description: 'Go to Fifth App', action: 'App 5' },
        { key: 'ctrl+6', description: 'Go to Sixth App', action: 'App 6' },
        { key: 'ctrl+7', description: 'Go to Seventh App', action: 'App 7' },
        { key: 'ctrl+8', description: 'Go to Eighth App', action: 'App 8' },
        { key: 'ctrl+9', description: 'Go to Ninth App', action: 'App 9' },
      ]
    },
    {
      category: 'WebView',
      shortcuts: [
        { key: KEYBOARD_SHORTCUTS.WEBVIEW_BACK, description: 'Go Back', action: 'Back' },
        { key: KEYBOARD_SHORTCUTS.WEBVIEW_FORWARD, description: 'Go Forward', action: 'Forward' },
        { key: KEYBOARD_SHORTCUTS.WEBVIEW_REFRESH, description: 'Refresh Page', action: 'Refresh' },
        { key: KEYBOARD_SHORTCUTS.PRINT, description: 'Print Page', action: 'Print' },
        { key: KEYBOARD_SHORTCUTS.WEBVIEW_ZOOM_IN, description: 'Zoom In', action: 'Zoom In' },
        { key: KEYBOARD_SHORTCUTS.WEBVIEW_ZOOM_OUT, description: 'Zoom Out', action: 'Zoom Out' },
        { key: KEYBOARD_SHORTCUTS.WEBVIEW_ZOOM_RESET, description: 'Reset Zoom', action: 'Reset Zoom' },
      ]
    },
    {
      category: 'Interface',
      shortcuts: [
        { key: 'escape', description: 'Close Modal/Drawer', action: 'Close' },
      ]
    }
  ].map(category => ({
    ...category,
    shortcuts: category.shortcuts.map(shortcut => ({
      ...shortcut,
      displayKey: getShortcutDescription(shortcut.key)
    }))
  }));
};

export default useStreamlinedKeyboardShortcuts;
