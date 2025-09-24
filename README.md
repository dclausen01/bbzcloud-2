# BBZCloud - Enhanced Keyboard Shortcuts

This document outlines the enhanced keyboard shortcuts functionality added to BBZCloud, including power user features and a command palette.

## New Features

### 1. Power User Shortcuts

Enhanced keyboard shortcuts for advanced users:

- **Ctrl+Shift+P**: Open Command Palette
- **Ctrl+F**: Focus Search
- **Ctrl+Shift+T**: Create New Todo
- **Ctrl+Shift+N**: Create New Document
- **Ctrl+W**: Close Tab
- **Ctrl+T**: Open New Tab

### 2. Command Palette

A searchable interface for accessing all application features:

- Press Ctrl+Shift+P to open
- Type to search for commands
- Use arrow keys to navigate
- Press Enter to execute selected command

### 3. Key Sequence Detection

Support for multi-key shortcuts:

- Ctrl+K, then C: Open Custom Apps Menu

## Implementation Files

- `src/hooks/usePowerUserShortcuts.js`: Hook for handling power user shortcuts
- `src/components/CommandPalette.js`: Command palette component
- `src/styles/command-palette.css`: Styles for the command palette
- `docs/keyboard-shortcuts.md`: Detailed user guide
- `src/utils/constants.js`: Updated keyboard shortcuts definitions

## Usage

The power user shortcuts are automatically enabled and integrated into the main App component. The command palette can be opened with Ctrl+Shift+P or through the new keyboard shortcuts documentation page in settings.

## Customization

Keyboard shortcuts can be customized through the settings panel. Users can modify shortcuts to their preference and view all available shortcuts in the documentation.
