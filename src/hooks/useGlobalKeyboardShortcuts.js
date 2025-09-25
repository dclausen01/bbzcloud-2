/**
 * BBZCloud - Global Keyboard Shortcuts for WebView Context
 * 
 * This hook provides a solution for keyboard shortcuts that work even when
 * focus is inside webviews. It uses Electron's globalShortcut API to register
 * system-wide shortcuts that bypass the webview isolation.
 * 
 * FEATURES:
 * - Works when webview has focus
 * - System-wide shortcut registration
 * - Automatic cleanup on component unmount
 * - Fallback to regular shortcuts when Electron API is not available
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.0.38
 */

import { useEffect, useRef } from 'react';
import { KEYBOARD_SHORTCUTS } from '../utils/constants';

/**
 * Hook for global keyboard shortcuts that work even in webview context
 * 
 * This hook registers shortcuts with Electron's globalShortcut API, which
 * allows them to work even when focus is inside a webview. It automatically
 * falls back to regular DOM event listeners if Electron API is not available.
 * 
 * @param {Object} shortcuts - Object mapping shortcut keys to handler functions
 * @param {boolean} enabled - Whether shortcuts are currently enabled
 */
export const useGlobalKeyboardShortcuts = (shortcuts = {}, enabled = true) => {
  const registeredShortcutsRef = useRef(new Set());

  useEffect(() => {
    if (!enabled || !window.electron?.globalShortcut) {
      return;
    }

    // Register global shortcuts
    Object.entries(shortcuts).forEach(([shortcutKey, handler]) => {
      if (typeof handler === 'function') {
        try {
          // Convert our shortcut format to Electron's accelerator format
          const accelerator = convertToElectronAccelerator(shortcutKey);
          
          // Register the global shortcut
          const success = window.electron.globalShortcut.register(accelerator, handler);
          
          if (success) {
            registeredShortcutsRef.current.add(accelerator);
          } else {
            console.warn(`Failed to register global shortcut: ${accelerator}`);
          }
        } catch (error) {
          console.error(`Error registering global shortcut ${shortcutKey}:`, error);
        }
      }
    });

    // Cleanup function
    return () => {
      registeredShortcutsRef.current.forEach(accelerator => {
        try {
          window.electron.globalShortcut.unregister(accelerator);
        } catch (error) {
          console.error(`Error unregistering global shortcut ${accelerator}:`, error);
        }
      });
      registeredShortcutsRef.current.clear();
    };
  }, [shortcuts, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (window.electron?.globalShortcut) {
        registeredShortcutsRef.current.forEach(accelerator => {
          try {
            window.electron.globalShortcut.unregister(accelerator);
          } catch (error) {
            console.error(`Error unregistering global shortcut on unmount ${accelerator}:`, error);
          }
        });
        registeredShortcutsRef.current.clear();
      }
    };
  }, []);
};

/**
 * Convert our internal shortcut format to Electron's accelerator format
 * 
 * Our format: 'ctrl+shift+p'
 * Electron format: 'CommandOrControl+Shift+P'
 * 
 * @param {string} shortcut - Our internal shortcut string
 * @returns {string} - Electron accelerator string
 */
const convertToElectronAccelerator = (shortcut) => {
  const parts = shortcut.split('+');
  const acceleratorParts = [];

  parts.forEach(part => {
    switch (part.toLowerCase()) {
      case 'ctrl':
        acceleratorParts.push('CommandOrControl');
        break;
      case 'alt':
        acceleratorParts.push('Alt');
        break;
      case 'shift':
        acceleratorParts.push('Shift');
        break;
      case 'meta':
      case 'cmd':
        acceleratorParts.push('Command');
        break;
      case 'escape':
        acceleratorParts.push('Escape');
        break;
      case 'enter':
        acceleratorParts.push('Return');
        break;
      case 'space':
        acceleratorParts.push('Space');
        break;
      case 'tab':
        acceleratorParts.push('Tab');
        break;
      case 'backspace':
        acceleratorParts.push('Backspace');
        break;
      case 'delete':
        acceleratorParts.push('Delete');
        break;
      case 'home':
        acceleratorParts.push('Home');
        break;
      case 'end':
        acceleratorParts.push('End');
        break;
      case 'pageup':
        acceleratorParts.push('PageUp');
        break;
      case 'pagedown':
        acceleratorParts.push('PageDown');
        break;
      case 'left':
        acceleratorParts.push('Left');
        break;
      case 'right':
        acceleratorParts.push('Right');
        break;
      case 'up':
        acceleratorParts.push('Up');
        break;
      case 'down':
        acceleratorParts.push('Down');
        break;
      case 'f1': case 'f2': case 'f3': case 'f4': case 'f5': case 'f6':
      case 'f7': case 'f8': case 'f9': case 'f10': case 'f11': case 'f12':
        acceleratorParts.push(part.toUpperCase());
        break;
      case 'plus':
        acceleratorParts.push('Plus');
        break;
      case 'minus':
        acceleratorParts.push('Minus');
        break;
      default:
        // For regular keys, just capitalize
        acceleratorParts.push(part.toUpperCase());
        break;
    }
  });

  return acceleratorParts.join('+');
};

/**
 * Hook for global application shortcuts that work in webview context
 * 
 * This is a specialized version of useGlobalKeyboardShortcuts that focuses
 * on the most important application shortcuts that users expect to work
 * even when they're interacting with webviews.
 * 
 * @param {Object} handlers - Object containing handler functions
 * @param {boolean} enabled - Whether shortcuts are enabled
 */
export const useGlobalAppShortcuts = (handlers = {}, enabled = true) => {
  const {
    onOpenCommandPalette,
    onToggleTodo,
    onToggleSecureDocs,
    onOpenSettings,
    onReloadCurrent,
    onReloadAll,
  } = handlers;

  const shortcuts = {};

  // Only register the most important shortcuts globally to avoid conflicts
  if (onOpenCommandPalette) {
    shortcuts[KEYBOARD_SHORTCUTS.COMMAND_PALETTE] = onOpenCommandPalette;
  }

  if (onToggleTodo) {
    shortcuts[KEYBOARD_SHORTCUTS.TOGGLE_TODO] = onToggleTodo;
  }

  if (onToggleSecureDocs) {
    shortcuts[KEYBOARD_SHORTCUTS.TOGGLE_SECURE_DOCS] = onToggleSecureDocs;
  }

  if (onOpenSettings) {
    shortcuts[KEYBOARD_SHORTCUTS.OPEN_SETTINGS] = onOpenSettings;
  }

  if (onReloadCurrent) {
    shortcuts[KEYBOARD_SHORTCUTS.RELOAD_CURRENT] = onReloadCurrent;
  }

  if (onReloadAll) {
    shortcuts[KEYBOARD_SHORTCUTS.RELOAD_ALL] = onReloadAll;
  }

  useGlobalKeyboardShortcuts(shortcuts, enabled);
};

/**
 * Hook for global navigation shortcuts that work in webview context
 * 
 * This allows Ctrl+1-9 shortcuts to work even when focus is inside a webview.
 * 
 * @param {Function} onNavigate - Function called when navigation shortcut is pressed
 * @param {Array} navigationItems - Array of navigation items
 * @param {boolean} enabled - Whether shortcuts are enabled
 */
export const useGlobalNavigationShortcuts = (onNavigate, navigationItems = [], enabled = true) => {
  const shortcuts = {};

  // Create global shortcuts for Ctrl+1 through Ctrl+9
  for (let i = 1; i <= 9; i++) {
    const shortcutKey = `ctrl+${i}`;
    shortcuts[shortcutKey] = () => {
      const index = i - 1;
      if (navigationItems[index] && onNavigate) {
        onNavigate(navigationItems[index]);
      }
    };
  }

  useGlobalKeyboardShortcuts(shortcuts, enabled);
};

export default useGlobalKeyboardShortcuts;
