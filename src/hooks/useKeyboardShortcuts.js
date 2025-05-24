import { useEffect, useCallback, useRef } from 'react';
import { KEYBOARD_SHORTCUTS } from '../utils/constants';

/**
 * Custom hook for managing global keyboard shortcuts
 * @param {Object} shortcuts - Object mapping shortcut keys to handler functions
 * @param {boolean} enabled - Whether shortcuts are enabled (default: true)
 * @returns {Object} - Object with shortcut management functions
 */
export const useKeyboardShortcuts = (shortcuts = {}, enabled = true) => {
  const shortcutsRef = useRef(shortcuts);
  const enabledRef = useRef(enabled);

  // Update refs when props change
  useEffect(() => {
    shortcutsRef.current = shortcuts;
    enabledRef.current = enabled;
  }, [shortcuts, enabled]);

  const handleKeyDown = useCallback((event) => {
    if (!enabledRef.current) return;

    // Don't trigger shortcuts when typing in input fields
    const activeElement = document.activeElement;
    const isInputField = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.contentEditable === 'true'
    );

    // Allow certain shortcuts even in input fields
    const allowedInInputs = [
      KEYBOARD_SHORTCUTS.CLOSE_MODAL,
      KEYBOARD_SHORTCUTS.TOGGLE_FULLSCREEN,
    ];

    const currentShortcut = getShortcutString(event);
    const isAllowedInInput = allowedInInputs.includes(currentShortcut);

    if (isInputField && !isAllowedInInput) return;

    const handler = shortcutsRef.current[currentShortcut];
    if (handler && typeof handler === 'function') {
      event.preventDefault();
      event.stopPropagation();
      handler(event);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [handleKeyDown, enabled]);

  return {
    addShortcut: useCallback((key, handler) => {
      shortcutsRef.current = { ...shortcutsRef.current, [key]: handler };
    }, []),
    
    removeShortcut: useCallback((key) => {
      const newShortcuts = { ...shortcutsRef.current };
      delete newShortcuts[key];
      shortcutsRef.current = newShortcuts;
    }, []),
    
    enable: useCallback(() => {
      enabledRef.current = true;
    }, []),
    
    disable: useCallback(() => {
      enabledRef.current = false;
    }, []),
  };
};

/**
 * Convert keyboard event to shortcut string
 * @param {KeyboardEvent} event - The keyboard event
 * @returns {string} - The shortcut string (e.g., 'ctrl+t')
 */
const getShortcutString = (event) => {
  const parts = [];
  
  // Handle modifiers
  if (event.ctrlKey || event.metaKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  
  // Handle special keys
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
    'home': 'home',
    'end': 'end',
    'pageup': 'pageup',
    'pagedown': 'pagedown',
    'delete': 'delete',
    'backspace': 'backspace',
    '+': 'plus',
    '-': 'minus',
    '=': 'equal',
    ',': 'comma',
    '.': 'period',
    '/': 'slash',
    '\\': 'backslash',
    '[': 'bracketleft',
    ']': 'bracketright',
    ';': 'semicolon',
    "'": 'quote',
    '`': 'backquote',
  };
  
  key = keyMap[key] || key;
  
  // Handle number keys
  if (/^\d$/.test(key)) {
    parts.push(key);
  } else {
    parts.push(key);
  }
  
  return parts.join('+');
};

/**
 * Hook for navigation shortcuts specifically
 * @param {Function} onNavigate - Function to call when navigation shortcut is pressed
 * @param {Array} navigationItems - Array of navigation items
 * @param {boolean} enabled - Whether navigation shortcuts are enabled
 */
export const useNavigationShortcuts = (onNavigate, navigationItems = [], enabled = true) => {
  const shortcuts = {};
  
  // Create shortcuts for Ctrl+1 through Ctrl+9
  for (let i = 1; i <= 9; i++) {
    const shortcutKey = `ctrl+${i}`;
    shortcuts[shortcutKey] = () => {
      const index = i - 1;
      if (navigationItems[index] && onNavigate) {
        onNavigate(navigationItems[index]);
      }
    };
  }
  
  useKeyboardShortcuts(shortcuts, enabled);
};

/**
 * Hook for modal/drawer shortcuts
 * @param {Function} onClose - Function to call when close shortcut is pressed
 * @param {boolean} isOpen - Whether the modal/drawer is open
 */
export const useModalShortcuts = (onClose, isOpen = false) => {
  const shortcuts = {
    [KEYBOARD_SHORTCUTS.CLOSE_MODAL]: () => {
      if (isOpen && onClose) {
        onClose();
      }
    },
  };
  
  useKeyboardShortcuts(shortcuts, isOpen);
};

/**
 * Hook for webview shortcuts
 * @param {Object} webViewRef - Ref to the webview container
 * @param {boolean} enabled - Whether webview shortcuts are enabled
 */
export const useWebViewShortcuts = (webViewRef, enabled = true) => {
  const shortcuts = {
    [KEYBOARD_SHORTCUTS.WEBVIEW_BACK]: () => {
      if (webViewRef.current) {
        webViewRef.current.goBack();
      }
    },
    
    [KEYBOARD_SHORTCUTS.WEBVIEW_FORWARD]: () => {
      if (webViewRef.current) {
        webViewRef.current.goForward();
      }
    },
    
    [KEYBOARD_SHORTCUTS.WEBVIEW_REFRESH]: () => {
      if (webViewRef.current) {
        webViewRef.current.reload();
      }
    },
    
    [KEYBOARD_SHORTCUTS.PRINT]: () => {
      if (webViewRef.current) {
        webViewRef.current.print();
      }
    },
  };
  
  useKeyboardShortcuts(shortcuts, enabled);
};

/**
 * Hook for application-level shortcuts
 * @param {Object} handlers - Object containing handler functions
 * @param {boolean} enabled - Whether app shortcuts are enabled
 */
export const useAppShortcuts = (handlers = {}, enabled = true) => {
  const {
    onToggleTodo,
    onToggleSecureDocs,
    onOpenSettings,
    onReloadCurrent,
    onReloadAll,
    onToggleFullscreen,
  } = handlers;
  
  const shortcuts = {};
  
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
  
  if (onToggleFullscreen) {
    shortcuts[KEYBOARD_SHORTCUTS.TOGGLE_FULLSCREEN] = onToggleFullscreen;
  }
  
  useKeyboardShortcuts(shortcuts, enabled);
};

/**
 * Get human-readable shortcut description
 * @param {string} shortcut - The shortcut string
 * @returns {string} - Human-readable description
 */
export const getShortcutDescription = (shortcut) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  return shortcut
    .replace('ctrl', isMac ? '⌘' : 'Ctrl')
    .replace('alt', isMac ? '⌥' : 'Alt')
    .replace('shift', isMac ? '⇧' : 'Shift')
    .replace('+', isMac ? '' : '+')
    .toUpperCase();
};

export default useKeyboardShortcuts;
