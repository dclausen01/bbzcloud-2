/**
 * BBZCloud - Command Palette Component
 * 
 * This component provides a searchable command palette that allows users to
 * quickly access various features and functions of the application through
 * keyboard shortcuts or direct search.
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.0.38
 */

import React, { useState, useEffect, useRef } from 'react';
import { KEYBOARD_SHORTCUTS } from '../utils/constants';

/**
 * Command Palette Component
 * 
 * A searchable overlay that allows users to quickly access application features.
 * 
 * @param {Object} props - Component properties
 * @param {boolean} props.isOpen - Whether the command palette is open
 * @param {Function} props.onClose - Function to call when closing the palette
 * @param {Function} props.onSelectCommand - Function to call when a command is selected
 */
const CommandPalette = ({ isOpen, onClose, onSelectCommand }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const resultsListRef = useRef(null);

  // Focus the input when the palette opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      // Reset selection when opening
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Define available commands
  const commands = [
    {
      id: 'toggle-todo-drawer',
      name: 'Toggle Todo Drawer',
      description: 'Open or close the todo items drawer',
      shortcut: KEYBOARD_SHORTCUTS.TOGGLE_TODO_DRAWER,
      category: 'Navigation',
      action: () => onSelectCommand('TOGGLE_TODO_DRAWER')
    },
    {
      id: 'toggle-secure-docs-drawer',
      name: 'Toggle Secure Docs Drawer',
      description: 'Open or close the secure documents drawer',
      shortcut: KEYBOARD_SHORTCUTS.TOGGLE_SECURE_DOCS_DRAWER,
      category: 'Navigation',
      action: () => onSelectCommand('TOGGLE_SECURE_DOCS_DRAWER')
    },
    {
      id: 'open-settings',
      name: 'Open Settings',
      description: 'Open the application settings panel',
      shortcut: KEYBOARD_SHORTCUTS.OPEN_SETTINGS,
      category: 'Navigation',
      action: () => onSelectCommand('OPEN_SETTINGS')
    },
    {
      id: 'reload-app',
      name: 'Reload Application',
      description: 'Reload the current application view',
      shortcut: KEYBOARD_SHORTCUTS.RELOAD,
      category: 'System',
      action: () => onSelectCommand('RELOAD')
    },
    {
      id: 'navigate-app-1',
      name: 'Navigate to App 1',
      description: 'Switch to the first application',
      shortcut: KEYBOARD_SHORTCUTS.NAVIGATE_APP_1,
      category: 'Navigation',
      action: () => onSelectCommand('NAVIGATE_APP_1')
    },
    {
      id: 'navigate-app-2',
      name: 'Navigate to App 2',
      description: 'Switch to the second application',
      shortcut: KEYBOARD_SHORTCUTS.NAVIGATE_APP_2,
      category: 'Navigation',
      action: () => onSelectCommand('NAVIGATE_APP_2')
    },
    {
      id: 'navigate-app-3',
      name: 'Navigate to App 3',
      description: 'Switch to the third application',
      shortcut: KEYBOARD_SHORTCUTS.NAVIGATE_APP_3,
      category: 'Navigation',
      action: () => onSelectCommand('NAVIGATE_APP_3')
    },
    {
      id: 'navigate-app-4',
      name: 'Navigate to App 4',
      description: 'Switch to the fourth application',
      shortcut: KEYBOARD_SHORTCUTS.NAVIGATE_APP_4,
      category: 'Navigation',
      action: () => onSelectCommand('NAVIGATE_APP_4')
    },
    {
      id: 'navigate-app-5',
      name: 'Navigate to App 5',
      description: 'Switch to the fifth application',
      shortcut: KEYBOARD_SHORTCUTS.NAVIGATE_APP_5,
      category: 'Navigation',
      action: () => onSelectCommand('NAVIGATE_APP_5')
    },
    {
      id: 'navigate-app-6',
      name: 'Navigate to App 6',
      description: 'Switch to the sixth application',
      shortcut: KEYBOARD_SHORTCUTS.NAVIGATE_APP_6,
      category: 'Navigation',
      action: () => onSelectCommand('NAVIGATE_APP_6')
    },
    {
      id: 'navigate-app-7',
      name: 'Navigate to App 7',
      description: 'Switch to the seventh application',
      shortcut: KEYBOARD_SHORTCUTS.NAVIGATE_APP_7,
      category: 'Navigation',
      action: () => onSelectCommand('NAVIGATE_APP_7')
    },
    {
      id: 'navigate-app-8',
      name: 'Navigate to App 8',
      description: 'Switch to the eighth application',
      shortcut: KEYBOARD_SHORTCUTS.NAVIGATE_APP_8,
      category: 'Navigation',
      action: () => onSelectCommand('NAVIGATE_APP_8')
    },
    {
      id: 'navigate-app-9',
      name: 'Navigate to App 9',
      description: 'Switch to the ninth application',
      shortcut: KEYBOARD_SHORTCUTS.NAVIGATE_APP_9,
      category: 'Navigation',
      action: () => onSelectCommand('NAVIGATE_APP_9')
    },
    {
      id: 'webview-back',
      name: 'WebView Back',
      description: 'Navigate back in the webview history',
      shortcut: KEYBOARD_SHORTCUTS.WEBVIEW_BACK,
      category: 'WebView',
      action: () => onSelectCommand('WEBVIEW_BACK')
    },
    {
      id: 'webview-forward',
      name: 'WebView Forward',
      description: 'Navigate forward in the webview history',
      shortcut: KEYBOARD_SHORTCUTS.WEBVIEW_FORWARD,
      category: 'WebView',
      action: () => onSelectCommand('WEBVIEW_FORWARD')
    },
    {
      id: 'webview-refresh',
      name: 'Refresh WebView',
      description: 'Refresh the current webview content',
      shortcut: KEYBOARD_SHORTCUTS.WEBVIEW_REFRESH,
      category: 'WebView',
      action: () => onSelectCommand('WEBVIEW_REFRESH')
    },
    {
      id: 'print',
      name: 'Print',
      description: 'Print the current webview content',
      shortcut: KEYBOARD_SHORTCUTS.PRINT,
      category: 'System',
      action: () => onSelectCommand('PRINT')
    },
    {
      id: 'toggle-fullscreen',
      name: 'Toggle Fullscreen',
      description: 'Toggle fullscreen mode',
      shortcut: KEYBOARD_SHORTCUTS.TOGGLE_FULLSCREEN,
      category: 'System',
      action: () => onSelectCommand('TOGGLE_FULLSCREEN')
    },
    {
      id: 'close-modal',
      name: 'Close Modal/Drawer',
      description: 'Close the currently open modal or drawer',
      shortcut: KEYBOARD_SHORTCUTS.CLOSE_MODAL,
      category: 'Navigation',
      action: () => onSelectCommand('CLOSE_MODAL')
    },
    {
      id: 'command-palette',
      name: 'Command Palette',
      description: 'Open this command palette',
      shortcut: KEYBOARD_SHORTCUTS.COMMAND_PALETTE,
      category: 'System',
      action: () => onSelectCommand('COMMAND_PALETTE')
    },
    {
      id: 'focus-search',
      name: 'Focus Search',
      description: 'Focus the search input field',
      shortcut: KEYBOARD_SHORTCUTS.FOCUS_SEARCH,
      category: 'Navigation',
      action: () => onSelectCommand('FOCUS_SEARCH')
    },
    {
      id: 'new-todo',
      name: 'New Todo',
      description: 'Create a new todo item',
      shortcut: KEYBOARD_SHORTCUTS.NEW_TODO,
      category: 'Tasks',
      action: () => onSelectCommand('NEW_TODO')
    },
    {
      id: 'new-document',
      name: 'New Document',
      description: 'Create a new document',
      shortcut: KEYBOARD_SHORTCUTS.NEW_DOCUMENT,
      category: 'Documents',
      action: () => onSelectCommand('NEW_DOCUMENT')
    },
    {
      id: 'close-tab',
      name: 'Close Tab',
      description: 'Close the current tab',
      shortcut: KEYBOARD_SHORTCUTS.CLOSE_TAB,
      category: 'Navigation',
      action: () => onSelectCommand('CLOSE_TAB')
    },
    {
      id: 'new-tab',
      name: 'New Tab',
      description: 'Open a new tab',
      shortcut: KEYBOARD_SHORTCUTS.NEW_TAB,
      category: 'Navigation',
      action: () => onSelectCommand('NEW_TAB')
    }
  ];

  // Filter commands based on search term
  const filteredCommands = commands.filter(command => 
    command.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    command.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    command.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle keyboard navigation
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex(prev => 
        Math.min(prev + 1, filteredCommands.length - 1)
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (filteredCommands.length > 0) {
        const selectedCommand = filteredCommands[selectedIndex];
        selectedCommand.action();
        onClose();
      }
      return;
    }
  };

  // Scroll the selected item into view
  useEffect(() => {
    if (resultsListRef.current && filteredCommands.length > 0) {
      const selectedItem = resultsListRef.current.children[selectedIndex];
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, filteredCommands]);

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" onKeyDown={handleKeyDown}>
      <div className="command-palette">
        <div className="command-palette-header">
          <input
            ref={inputRef}
            type="text"
            className="command-palette-search"
            placeholder="Type a command or search..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setSelectedIndex(0); // Reset selection when typing
            }}
          />
        </div>
        <div className="command-palette-results" ref={resultsListRef}>
          {filteredCommands.length > 0 ? (
            filteredCommands.map((command, index) => (
              <div
                key={command.id}
                className={`command-palette-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => {
                  command.action();
                  onClose();
                }}
              >
                <div className="command-palette-item-info">
                  <div className="command-palette-item-name">{command.name}</div>
                  <div className="command-palette-item-description">{command.description}</div>
                </div>
                <div className="command-palette-item-shortcut">
                  {command.shortcut}
                </div>
              </div>
            ))
          ) : (
            <div className="command-palette-no-results">
              No commands found for "{searchTerm}"
            </div>
          )}
        </div>
        <div className="command-palette-footer">
          <div className="command-palette-hint">
            <span>↑↓</span> Navigate
          </div>
          <div className="command-palette-hint">
            <span>Enter</span> Select
          </div>
          <div className="command-palette-hint">
            <span>Esc</span> Close
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
