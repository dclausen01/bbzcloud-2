/**
 * BBZCloud - Consolidated Keyboard Shortcuts Hook
 * 
 * This hook consolidates all keyboard shortcut functionality into a single,
 * non-conflicting implementation. It replaces the multiple hooks that were
 * causing conflicts and the black screen issue.
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.0.39
 */

import { useEffect, useCallback, useRef } from 'react';
import { KEYBOARD_SHORTCUTS } from '../utils/constants';

/**
 * Consolidated keyboard shortcuts hook
 * 
 * This hook manages all keyboard shortcuts in one place to prevent conflicts
 * and ensure reliable operation across different focus contexts.
 * 
 * @param {Object} handlers - All handler functions for shortcuts
 * @param {Array} navigationItems - Navigation items for Ctrl+1-9 shortcuts
 * @param {Object} modalStates - States of modals/drawers for escape handling
 * @param {Object} webViewRef - Reference to webview container
 * @param {boolean} enabled - Whether shortcuts are enabled
 */
export const useConsolidatedKeyboardShortcuts = ({
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

  // Update refs when props change
  useEffect(() => {
    handlersRef.current = handlers;
    navigationItemsRef.current = navigationItems;
    modalStatesRef.current = modalStates;
    webViewRefRef.current = webViewRef;
  }, [handlers, navigationItems, modalStates, webViewRef]);

  /**
   * Convert keyboard event to shortcut string
   */
  const getShortcutString = useCallback((event) => {
    const parts = [];
    
    if (event.ctrlKey || event.metaKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    
    let key = event.key.toLowerCase();
    
    // Map special keys
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
    };
    
    key = keyMap[key] || key;
    parts.push(key);
    
    return parts.join('+');
  }, []);

  /**
   * Check if user is typing in an input field
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
   */
  const handleKeyDown = useCallback((event) => {
    if (!enabled) return;

    const shortcut = getShortcutString(event);
    const isInInput = isTypingInInput();
    const currentHandlers = handlersRef.current;
    const currentNavigationItems = navigationItemsRef.current;
    const currentModalStates = modalStatesRef.current;
    const currentWebViewRef = webViewRefRef.current;

    // Allow escape key even when typing
    if (shortcut === 'escape') {
      // Check if any modal is open and close it
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
      if (currentModalStates.isCommandPaletteOpen && currentHandlers.onCommandPaletteClose) {
        event.preventDefault();
        currentHandlers.onCommandPaletteClose();
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
    }

    // If we handled the shortcut, stop propagation
    if (handled) {
      event.stopPropagation();
    }
  }, [enabled, getShortcutString, isTypingInInput]);

  // Set up event listener
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
              'ctrl+1': 'NAV_1', 'ctrl+2': 'NAV_2', 'ctrl+3': 'NAV_3',
              'ctrl+4': 'NAV_4', 'ctrl+5': 'NAV_5', 'ctrl+6': 'NAV_6',
              'ctrl+7': 'NAV_7', 'ctrl+8': 'NAV_8', 'ctrl+9': 'NAV_9'
            };

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
              // Don't handle shortcuts when typing in input fields
              if (isTypingInInput() && event.key !== 'Escape') return;
              
              const shortcutString = getShortcutString(event);
              const shortcutAction = shortcuts[shortcutString];
              
              if (shortcutAction) {
                event.preventDefault();
                event.stopPropagation();
                
                // Send message to parent window with multiple fallback methods
                try {
                  // Method 1: PostMessage to parent
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                      type: 'keyboard-shortcut',
                      action: shortcutAction,
                      shortcut: shortcutString
                    }, '*');
                  }
                  
                  // Method 2: Try to access parent directly (if same origin)
                  if (window.parent && window.parent.handleWebViewShortcut) {
                    window.parent.handleWebViewShortcut(shortcutAction, shortcutString);
                  }
                  
                  // Method 3: Custom event on document
                  const customEvent = new CustomEvent('bbzcloud-shortcut', {
                    detail: { action: shortcutAction, shortcut: shortcutString }
                  });
                  document.dispatchEvent(customEvent);
                  
                } catch (e) {
                  console.warn('Could not send keyboard shortcut message:', e);
                }
              }
            }, true); // Use capture phase for higher priority
            
            // Also listen for focus events to re-inject if needed
            window.addEventListener('focus', function() {
              if (!window.__bbzcloudKeyboardHandlerInjected) {
                window.__bbzcloudKeyboardHandlerInjected = true;
              }
            });
            
            console.log('BBZCloud keyboard shortcuts injected successfully');
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

    window.addEventListener('message', handleMessage);
    const cleanupWebViewHandling = setupWebViewKeyboardHandling();

    return () => {
      window.removeEventListener('message', handleMessage);
      if (cleanupWebViewHandling) {
        cleanupWebViewHandling();
      }
    };
  }, [enabled]);
};

export default useConsolidatedKeyboardShortcuts;
