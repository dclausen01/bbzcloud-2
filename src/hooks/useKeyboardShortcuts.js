/**
 * BBZCloud - Keyboard Shortcuts Management
 * 
 * This file provides a comprehensive keyboard shortcuts system for the BBZCloud application.
 * It includes hooks for different types of shortcuts (global, navigation, modal, webview)
 * and handles cross-platform compatibility (Windows/Mac).
 * 
 * FEATURES:
 * - Global application shortcuts (Ctrl+T for todo, Ctrl+D for documents, etc.)
 * - Navigation shortcuts (Ctrl+1-9 for quick app switching)
 * - Modal/drawer shortcuts (Escape to close)
 * - WebView shortcuts (Alt+Left/Right for navigation, F5 for reload)
 * - Smart input field detection (prevents shortcuts when typing)
 * - Cross-platform key mapping (Ctrl on Windows, Cmd on Mac)
 * 
 * CUSTOMIZATION GUIDE:
 * 1. Modify KEYBOARD_SHORTCUTS in constants.js to change default shortcuts
 * 2. Add new shortcut hooks by following the existing patterns
 * 3. Extend getShortcutString() for new key combinations
 * 4. Update getShortcutDescription() for better user-facing descriptions
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.0.38
 */

import { useEffect, useCallback, useRef } from 'react';
import { KEYBOARD_SHORTCUTS } from '../utils/constants';

// ============================================================================
// CORE KEYBOARD SHORTCUTS HOOK
// ============================================================================

/**
 * Core hook for managing keyboard shortcuts
 * 
 * This is the foundation hook that all other shortcut hooks build upon.
 * It handles event listening, key combination detection, and prevents
 * shortcuts from firing when users are typing in input fields.
 * 
 * @param {Object} shortcuts - Object mapping shortcut keys to handler functions
 *                            Example: { 'ctrl+t': () => openTodo() }
 * @param {boolean} enabled - Whether shortcuts are currently enabled (default: true)
 * @returns {Object} - Object with shortcut management functions
 */
export const useKeyboardShortcuts = (shortcuts = {}, enabled = true) => {
  // Use refs to avoid stale closures in event handlers
  const shortcutsRef = useRef(shortcuts);
  const enabledRef = useRef(enabled);

  // Update refs when props change to ensure handlers always have latest values
  useEffect(() => {
    shortcutsRef.current = shortcuts;
    enabledRef.current = enabled;
  }, [shortcuts, enabled]);

  /**
   * Main keyboard event handler
   * 
   * This function:
   * 1. Checks if shortcuts are enabled
   * 2. Detects if user is typing in an input field
   * 3. Converts the keyboard event to a shortcut string
   * 4. Executes the appropriate handler if found
   */
  const handleKeyDown = useCallback((event) => {
    // Early exit if shortcuts are disabled
    if (!enabledRef.current) return;

    // Detect if user is currently typing in an input field
    const activeElement = document.activeElement;
    const isInputField = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.contentEditable === 'true' ||
      activeElement.isContentEditable
    );

    // Some shortcuts should work even when typing (like Escape to close modals)
    const allowedInInputs = [
      KEYBOARD_SHORTCUTS.CLOSE_MODAL,        // Escape key
      KEYBOARD_SHORTCUTS.TOGGLE_FULLSCREEN,  // F11 key
    ];

    const currentShortcut = getShortcutString(event);
    const isAllowedInInput = allowedInInputs.includes(currentShortcut);

    // Don't trigger shortcuts when typing, unless it's an allowed shortcut
    if (isInputField && !isAllowedInInput) return;

    // Find and execute the handler for this shortcut
    const handler = shortcutsRef.current[currentShortcut];
    if (handler && typeof handler === 'function') {
      event.preventDefault();  // Prevent default browser behavior
      event.stopPropagation(); // Stop event from bubbling up
      handler(event);
    }
  }, []);

  // Set up and clean up the global keyboard event listener
  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [handleKeyDown, enabled]);

  // Return utility functions for dynamic shortcut management
  return {
    /**
     * Add a new shortcut at runtime
     * @param {string} key - Shortcut string (e.g., 'ctrl+t')
     * @param {Function} handler - Function to call when shortcut is pressed
     */
    addShortcut: useCallback((key, handler) => {
      shortcutsRef.current = { ...shortcutsRef.current, [key]: handler };
    }, []),
    
    /**
     * Remove a shortcut at runtime
     * @param {string} key - Shortcut string to remove
     */
    removeShortcut: useCallback((key) => {
      const newShortcuts = { ...shortcutsRef.current };
      delete newShortcuts[key];
      shortcutsRef.current = newShortcuts;
    }, []),
    
    /**
     * Enable shortcuts (useful for temporarily disabling/enabling)
     */
    enable: useCallback(() => {
      enabledRef.current = true;
    }, []),
    
    /**
     * Disable shortcuts (useful for temporarily disabling/enabling)
     */
    disable: useCallback(() => {
      enabledRef.current = false;
    }, []),
  };
};

// ============================================================================
// KEY EVENT PROCESSING
// ============================================================================

/**
 * Convert a keyboard event to a standardized shortcut string
 * 
 * This function handles the complexity of cross-platform key detection
 * and converts keyboard events into consistent shortcut strings that
 * match the format used in our constants file.
 * 
 * Examples:
 * - Ctrl+T becomes 'ctrl+t'
 * - Cmd+Shift+R becomes 'ctrl+shift+r' (Mac Cmd is mapped to ctrl)
 * - F5 becomes 'f5'
 * - Alt+Left becomes 'alt+left'
 * 
 * @param {KeyboardEvent} event - The keyboard event from the browser
 * @returns {string} - Standardized shortcut string
 */
const getShortcutString = (event) => {
  const parts = [];
  
  // Handle modifier keys (order matters for consistency)
  if (event.ctrlKey || event.metaKey) parts.push('ctrl'); // Map Mac Cmd to Ctrl
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  
  // Get the main key and normalize it
  let key = event.key.toLowerCase();
  
  // Map special keys to consistent names
  const keyMap = {
    // Whitespace and control keys
    ' ': 'space',
    'escape': 'escape',
    'enter': 'enter',
    'tab': 'tab',
    
    // Arrow keys
    'arrowup': 'up',
    'arrowdown': 'down',
    'arrowleft': 'left',
    'arrowright': 'right',
    
    // Function keys
    'f1': 'f1', 'f2': 'f2', 'f3': 'f3', 'f4': 'f4',
    'f5': 'f5', 'f6': 'f6', 'f7': 'f7', 'f8': 'f8',
    'f9': 'f9', 'f10': 'f10', 'f11': 'f11', 'f12': 'f12',
    
    // Navigation keys
    'home': 'home',
    'end': 'end',
    'pageup': 'pageup',
    'pagedown': 'pagedown',
    'delete': 'delete',
    'backspace': 'backspace',
    
    // Punctuation and symbols
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
  
  // Use mapped key name if available, otherwise use the original
  key = keyMap[key] || key;
  
  // Add the main key to the parts array
  parts.push(key);
  
  // Join all parts with '+' to create the final shortcut string
  return parts.join('+');
};

// ============================================================================
// SPECIALIZED SHORTCUT HOOKS
// ============================================================================

/**
 * Hook for navigation shortcuts (Ctrl+1 through Ctrl+9)
 * 
 * This hook automatically creates shortcuts for quick navigation between
 * the first 9 applications in the navigation bar. Users can press Ctrl+1
 * to go to the first app, Ctrl+2 for the second, etc.
 * 
 * @param {Function} onNavigate - Function called when navigation shortcut is pressed
 *                               Receives the navigation item as parameter
 * @param {Array} navigationItems - Array of navigation items (apps/buttons)
 * @param {boolean} enabled - Whether navigation shortcuts are enabled
 */
export const useNavigationShortcuts = (onNavigate, navigationItems = [], enabled = true) => {
  const shortcuts = {};
  
  // Create shortcuts for Ctrl+1 through Ctrl+9
  for (let i = 1; i <= 9; i++) {
    const shortcutKey = `ctrl+${i}`;
    shortcuts[shortcutKey] = () => {
      const index = i - 1; // Convert to 0-based index
      if (navigationItems[index] && onNavigate) {
        onNavigate(navigationItems[index]);
      }
    };
  }
  
  useKeyboardShortcuts(shortcuts, enabled);
};

/**
 * Hook for modal and drawer shortcuts
 * 
 * This hook handles shortcuts that are specific to modal dialogs and
 * side drawers (like the todo list or settings panel). The most common
 * use case is pressing Escape to close an open modal or drawer.
 * 
 * @param {Function} onClose - Function to call when close shortcut is pressed
 * @param {boolean} isOpen - Whether the modal/drawer is currently open
 */
export const useModalShortcuts = (onClose, isOpen = false) => {
  const shortcuts = {
    [KEYBOARD_SHORTCUTS.CLOSE_MODAL]: () => {
      if (isOpen && onClose) {
        onClose();
      }
    },
  };
  
  // Only enable shortcuts when the modal/drawer is actually open
  useKeyboardShortcuts(shortcuts, isOpen);
};

/**
 * Hook for webview-specific shortcuts
 * 
 * This hook provides shortcuts for controlling embedded webviews,
 * such as navigation (back/forward), reloading, and printing.
 * These shortcuts mimic standard browser shortcuts.
 * 
 * @param {Object} webViewRef - React ref pointing to the webview container
 * @param {boolean} enabled - Whether webview shortcuts are enabled
 */
export const useWebViewShortcuts = (webViewRef, enabled = true) => {
  const shortcuts = {
    // Browser-style navigation shortcuts
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
    
    // Utility shortcuts
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
 * 
 * This hook handles global shortcuts that work throughout the entire
 * application, such as opening the todo list, settings, or reloading
 * content. These are the most commonly used shortcuts.
 * 
 * @param {Object} handlers - Object containing handler functions for various actions
 * @param {boolean} enabled - Whether app shortcuts are enabled
 */
export const useAppShortcuts = (handlers = {}, enabled = true) => {
  const {
    onToggleTodo,        // Function to open/close todo drawer
    onToggleSecureDocs,  // Function to open/close secure documents drawer
    onOpenSettings,      // Function to open settings panel
    onOpenCommandPalette, // Function to open command palette
    onReloadCurrent,     // Function to reload current webview
    onReloadAll,         // Function to reload all webviews
    onToggleFullscreen,  // Function to toggle fullscreen mode
  } = handlers;
  
  const shortcuts = {};
  
  // Only add shortcuts for handlers that are provided
  if (onToggleTodo) {
    shortcuts[KEYBOARD_SHORTCUTS.TOGGLE_TODO] = onToggleTodo;
  }
  
  if (onToggleSecureDocs) {
    shortcuts[KEYBOARD_SHORTCUTS.TOGGLE_SECURE_DOCS] = onToggleSecureDocs;
  }
  
  if (onOpenSettings) {
    shortcuts[KEYBOARD_SHORTCUTS.OPEN_SETTINGS] = onOpenSettings;
  }
  
  if (onOpenCommandPalette) {
    shortcuts[KEYBOARD_SHORTCUTS.COMMAND_PALETTE] = onOpenCommandPalette;
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

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert a shortcut string to a human-readable description
 * 
 * This function takes internal shortcut strings (like 'ctrl+t') and
 * converts them to user-friendly descriptions that can be displayed
 * in tooltips, help text, or settings panels.
 * 
 * Handles platform differences:
 * - Windows/Linux: Shows 'Ctrl+T'
 * - Mac: Shows '⌘T' (using Mac symbols)
 * 
 * @param {string} shortcut - The internal shortcut string
 * @returns {string} - Human-readable description
 */
export const getShortcutDescription = (shortcut) => {
  // Detect if we're running on Mac
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  return shortcut
    .replace('ctrl', isMac ? '⌘' : 'Ctrl')    // Command symbol on Mac, Ctrl on others
    .replace('alt', isMac ? '⌥' : 'Alt')      // Option symbol on Mac, Alt on others
    .replace('shift', isMac ? '⇧' : 'Shift')  // Shift symbol on Mac, Shift on others
    .replace(/\+/g, isMac ? '' : '+')         // No separators on Mac, + on others
    .toUpperCase();                           // Make it look more professional
};

/**
 * Get all available shortcuts with their descriptions
 * 
 * This utility function returns a complete list of all keyboard shortcuts
 * available in the application, along with their human-readable descriptions.
 * Useful for creating help dialogs or settings panels.
 * 
 * @returns {Array} - Array of objects with shortcut and description properties
 */
export const getAllShortcuts = () => {
  return [
    // Global application shortcuts
    {
      category: 'Application',
      shortcuts: [
        { key: KEYBOARD_SHORTCUTS.TOGGLE_TODO, description: 'Open/Close Todo List', action: 'Toggle Todo' },
        { key: KEYBOARD_SHORTCUTS.TOGGLE_SECURE_DOCS, description: 'Open/Close Secure Documents', action: 'Toggle Documents' },
        { key: KEYBOARD_SHORTCUTS.OPEN_SETTINGS, description: 'Open Settings Panel', action: 'Open Settings' },
        { key: KEYBOARD_SHORTCUTS.RELOAD_CURRENT, description: 'Reload Current Page', action: 'Reload Current' },
        { key: KEYBOARD_SHORTCUTS.RELOAD_ALL, description: 'Reload All Pages', action: 'Reload All' },
        { key: KEYBOARD_SHORTCUTS.TOGGLE_FULLSCREEN, description: 'Toggle Fullscreen Mode', action: 'Toggle Fullscreen' },
      ]
    },
    
    // Navigation shortcuts
    {
      category: 'Navigation',
      shortcuts: [
        { key: KEYBOARD_SHORTCUTS.NAV_APP_1, description: 'Go to First App', action: 'Navigate to App 1' },
        { key: KEYBOARD_SHORTCUTS.NAV_APP_2, description: 'Go to Second App', action: 'Navigate to App 2' },
        { key: KEYBOARD_SHORTCUTS.NAV_APP_3, description: 'Go to Third App', action: 'Navigate to App 3' },
        // ... continue for all 9 navigation shortcuts
      ]
    },
    
    // WebView shortcuts
    {
      category: 'WebView',
      shortcuts: [
        { key: KEYBOARD_SHORTCUTS.WEBVIEW_BACK, description: 'Go Back', action: 'Navigate Back' },
        { key: KEYBOARD_SHORTCUTS.WEBVIEW_FORWARD, description: 'Go Forward', action: 'Navigate Forward' },
        { key: KEYBOARD_SHORTCUTS.WEBVIEW_REFRESH, description: 'Refresh Page', action: 'Refresh' },
        { key: KEYBOARD_SHORTCUTS.PRINT, description: 'Print Page', action: 'Print' },
      ]
    },
    
    // Modal shortcuts
    {
      category: 'Interface',
      shortcuts: [
        { key: KEYBOARD_SHORTCUTS.CLOSE_MODAL, description: 'Close Modal/Drawer', action: 'Close' },
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

// Export the main hook as default for convenience
export default useKeyboardShortcuts;
