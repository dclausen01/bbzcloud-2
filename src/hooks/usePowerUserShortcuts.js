/**
 * BBZCloud - Power User Shortcuts Hook
 * 
 * This hook provides advanced keyboard shortcuts for power users who want to
 * navigate and control the application more efficiently. It builds upon the
 * existing keyboard shortcuts system with additional functionality.
 * 
 * FEATURES:
 * - Command palette for quick access to all features
 * - Focus management for search inputs
 * - Tab management (new/close tabs)
 * - Enhanced navigation shortcuts
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.0.38
 */

import { useCallback, useEffect, useState } from 'react';
import { KEYBOARD_SHORTCUTS } from '../utils/constants';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

/**
 * Hook for power user shortcuts
 * 
 * This hook provides advanced keyboard shortcuts that enhance productivity
 * for experienced users. It includes features like command palette,
 * focus management, and tab navigation.
 * 
 * @param {Object} handlers - Object containing handler functions for various actions
 * @param {boolean} enabled - Whether power user shortcuts are enabled
 */
export const usePowerUserShortcuts = (handlers = {}, enabled = true) => {
  const {
    onOpenCommandPalette,    // Function to open command palette
    onFocusSearch,           // Function to focus search input
    onCreateNewTodo,         // Function to create new todo item
    onCreateNewDocument,     // Function to create new document
    onCloseTab,              // Function to close current tab
    onOpenNewTab,            // Function to open new tab
    onOpenCustomAppsMenu,    // Function to open custom apps menu (Ctrl+K, then C)
  } = handlers;

  // State for tracking key sequences (like Ctrl+K, then C)
  const [keySequence, setKeySequence] = useState([]);
  const [sequenceTimeout, setSequenceTimeout] = useState(null);

  // Clear key sequence after timeout
  useEffect(() => {
    if (keySequence.length > 0) {
      const timeout = setTimeout(() => {
        setKeySequence([]);
      }, 1000); // 1 second timeout for key sequences
      
      setSequenceTimeout(timeout);
      return () => clearTimeout(timeout);
    }
  }, [keySequence]);

  // Handle key sequence detection
  const handleKeySequence = useCallback((event) => {
    if (!enabled) return;

    // Handle Ctrl+K as the start of a sequence
    if (event.ctrlKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      setKeySequence(['ctrl+k']);
      return;
    }

    // Handle the second key in a sequence
    if (keySequence.length === 1 && keySequence[0] === 'ctrl+k') {
      event.preventDefault();
      
      // Clear previous timeout
      if (sequenceTimeout) {
        clearTimeout(sequenceTimeout);
        setSequenceTimeout(null);
      }
      
      // Handle Ctrl+K, then C for custom apps menu
      if (event.key.toLowerCase() === 'c') {
        if (onOpenCustomAppsMenu) {
          onOpenCustomAppsMenu();
        }
        setKeySequence([]);
        return;
      }
      
      // Reset sequence for any other key
      setKeySequence([]);
    }
  }, [enabled, keySequence, sequenceTimeout, onOpenCustomAppsMenu]);

  // Set up key sequence listener
  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeySequence);
      return () => {
        document.removeEventListener('keydown', handleKeySequence);
      };
    }
  }, [handleKeySequence, enabled]);

  // Regular shortcuts
  const shortcuts = {};

  // Command palette shortcut
  if (onOpenCommandPalette) {
    shortcuts[KEYBOARD_SHORTCUTS.COMMAND_PALETTE] = onOpenCommandPalette;
  }

  // Focus search shortcut
  if (onFocusSearch) {
    shortcuts[KEYBOARD_SHORTCUTS.FOCUS_SEARCH] = onFocusSearch;
  }

  // New todo shortcut
  if (onCreateNewTodo) {
    shortcuts[KEYBOARD_SHORTCUTS.NEW_TODO] = onCreateNewTodo;
  }

  // New document shortcut
  if (onCreateNewDocument) {
    shortcuts[KEYBOARD_SHORTCUTS.NEW_DOCUMENT] = onCreateNewDocument;
  }

  // Close tab shortcut
  if (onCloseTab) {
    shortcuts[KEYBOARD_SHORTCUTS.CLOSE_TAB] = onCloseTab;
  }

  // New tab shortcut
  if (onOpenNewTab) {
    shortcuts[KEYBOARD_SHORTCUTS.NEW_TAB] = onOpenNewTab;
  }

  // Use the existing keyboard shortcuts system for regular shortcuts
  useKeyboardShortcuts(shortcuts, enabled);

  // Return utility functions
  return {
    /**
     * Reset the key sequence state
     */
    resetKeySequence: useCallback(() => {
      setKeySequence([]);
    }, []),
    
    /**
     * Get current key sequence for debugging
     */
    getKeySequence: useCallback(() => {
      return keySequence;
    }, [keySequence]),
  };
};

export default usePowerUserShortcuts;
