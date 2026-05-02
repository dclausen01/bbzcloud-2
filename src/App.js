/**
 * BBZCloud - Main Application Component
 * 
 * This is the main React component that orchestrates the entire BBZCloud application.
 * BBZCloud is an Electron-based desktop application that provides a unified interface
 * for educational web applications and tools.
 * 
 * ARCHITECTURE OVERVIEW:
 * - Uses Chakra UI for consistent, accessible UI components
 * - Implements a WebView-based architecture for embedding web applications
 * - Features a responsive navigation bar with customizable app buttons
 * - Includes secure credential management via Electron's keytar
 * - Supports keyboard shortcuts for power users
 * - Provides accessibility features for screen readers
 * - Includes a todo system and secure document storage
 * 
 * CUSTOMIZATION GUIDE:
 * To adapt this for your own organization:
 * 1. Update the navigation buttons in src/context/SettingsContext.js
 * 2. Modify the URLs in src/utils/constants.js
 * 3. Replace icons in assets/icons/ directory
 * 4. Update the welcome modal text and branding
 * 5. Adjust the user filtering logic in filterNavigationButtons()
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.2.4
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { CloseIcon } from '@chakra-ui/icons';
import {
  Box,
  Flex,
  IconButton,
  useColorMode,
  useColorModeValue,
  useDisclosure,
  ButtonGroup,
  Image,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  FormControl,
  FormLabel,
  Input,
  Button,
  InputGroup,
  InputRightElement,
  VStack,
  Text,
  Center,
  Spinner,
} from '@chakra-ui/react';

// Context and Components
import { useSettings } from './context/SettingsContext';
import { URLS } from './utils/constants';
import NavigationBar from './components/NavigationBar';
import WebViewContainer from './components/WebViewContainer';
import SettingsPanel from './components/SettingsPanel';
import CustomAppsMenu from './components/CustomAppsMenu';
import TodoList from './components/TodoList';
import DocumentsMenu from './components/DocumentsMenu';
import SecureDocuments from './components/SecureDocuments';
import DebugConsole from './components/DebugConsole';
import ShortcutsModal from './components/ShortcutsModal';

// Custom Hooks and Utilities
import { 
  useAppShortcuts, 
  useNavigationShortcuts, 
  useModalShortcuts 
} from './hooks/useKeyboardShortcuts';
import { 
  SUCCESS_MESSAGES, 
  ERROR_MESSAGES, 
  UI_CONFIG 
} from './utils/constants';
import { 
  saveFocus, 
  restoreFocus, 
  announceToScreenReader
} from './utils/accessibility';

/**
 * Helper function to create delays in async operations
 * Used primarily for ensuring reliable credential loading
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after the specified delay
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Get theme-aware background color without violating hooks rules
 * (useColorModeValue cannot be called inside conditional JSX blocks)
 */
const getWelcomeBg = (colorMode) => colorMode === 'dark' ? 'gray.900' : 'gray.50';
const getWelcomeTextColor = (colorMode) => colorMode === 'dark' ? 'gray.500' : 'gray.400';
const getWelcomeSpinnerEmpty = (colorMode) => colorMode === 'dark' ? 'gray.600' : 'gray.200';

/**
 * Main App Component
 * 
 * This component manages the entire application state and coordinates
 * between different features like navigation, webviews, settings, and user management.
 */
function App() {
  // ============================================================================
  // HOOKS AND STATE MANAGEMENT
  // ============================================================================
  
  console.log('App component rendering...');
  
  const { colorMode, setColorMode } = useColorMode();
  const { settings } = useSettings();
  const toast = useToast();
  
  console.log('App settings loaded:', settings);

  // Welcome Modal State - Handles first-time user setup
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [welcomeStep, setWelcomeStep] = useState(1); // 1: credentials, 2: database location

  // DB Password Modal State - Handles fallback decryption when keytar is empty
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [dbPasswordInput, setDbPasswordInput] = useState('');
  const [passwordModalError, setPasswordModalError] = useState('');
  const [passwordModalLoading, setPasswordModalLoading] = useState(false);

  // User Credentials State - Stored securely via Electron keytar
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bbbPassword, setBbbPassword] = useState(''); // BigBlueButton password
  const [webuntisEmail, setWebuntisEmail] = useState('');
  const [webuntisPassword, setWebuntisPassword] = useState('');
  const [schulportalEmail, setSchulportalEmail] = useState('');
  const [schulportalPassword, setSchulportalPassword] = useState('');
  const [schulcloudEncryptionPassword, setSchulcloudEncryptionPassword] = useState('');
  
  // Password visibility toggles for form inputs
  const [showPassword, setShowPassword] = useState(false);
  const [showBBBPassword, setShowBBBPassword] = useState(false);
  const [showWebuntisPassword, setShowWebuntisPassword] = useState(false);
  const [showSchulportalPassword, setShowSchulportalPassword] = useState(false);
  const [showEncryptionPassword, setShowEncryptionPassword] = useState(false);

  // Application State
  const [isLoadingEmail, setIsLoadingEmail] = useState(true);
  const [dbPath, setDbPath] = useState('');
  const [activeWebView, setActiveWebView] = useState(null);
  const [appIconPath, setAppIconPath] = useState('');
  const [appLogoPath, setAppLogoPath] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [hasUpdate, setHasUpdate] = useState(false);
  const [reminderCount, setReminderCount] = useState(0);
  const [isDebugMode, setIsDebugMode] = useState(false);

  // Refs for WebView management
  const webViewRef = useRef(null);

  // Drawer/Modal state management using Chakra UI's useDisclosure.
  // The default Chakra `onToggle` is bypassed in favour of the
  // single-panel toggle wrappers defined below.
  const {
    isOpen: isSettingsOpen,
    onOpen: onSettingsOpen,
    onClose: onSettingsClose,
  } = useDisclosure();

  const {
    isOpen: isTodoOpen,
    onOpen: onTodoOpen,
    onClose: onTodoClose,
  } = useDisclosure();

  const {
    isOpen: isSecureDocsOpen,
    onOpen: onSecureDocsOpen,
    onClose: onSecureDocsClose,
  } = useDisclosure();

  const {
    isOpen: isCommandPaletteOpen,
    onOpen: onCommandPaletteOpen,
    onClose: onCommandPaletteClose,
    onToggle: onCommandPaletteToggle
  } = useDisclosure();

  const {
    isOpen: isShortcutsOpen,
    onOpen: onShortcutsOpen,
    onClose: onShortcutsClose,
    onToggle: onShortcutsToggle
  } = useDisclosure();

  // ============================================================================
  // SINGLE-PANEL ENFORCEMENT
  // Reserved-gutter layout can only host one right-side panel at a time.
  // These wrappers close the others before opening the requested one.
  // ============================================================================

  const openSettings = useCallback(() => {
    onTodoClose();
    onSecureDocsClose();
    onSettingsOpen();
  }, [onSettingsOpen, onTodoClose, onSecureDocsClose]);

  const openTodo = useCallback(() => {
    onSettingsClose();
    onSecureDocsClose();
    onTodoOpen();
  }, [onTodoOpen, onSettingsClose, onSecureDocsClose]);

  const openSecureDocs = useCallback(() => {
    onSettingsClose();
    onTodoClose();
    onSecureDocsOpen();
  }, [onSecureDocsOpen, onSettingsClose, onTodoClose]);

  const toggleSettings = useCallback(() => {
    if (isSettingsOpen) onSettingsClose();
    else openSettings();
  }, [isSettingsOpen, onSettingsClose, openSettings]);

  const toggleTodo = useCallback(() => {
    if (isTodoOpen) onTodoClose();
    else openTodo();
  }, [isTodoOpen, onTodoClose, openTodo]);

  const toggleSecureDocs = useCallback(() => {
    if (isSecureDocsOpen) onSecureDocsClose();
    else openSecureDocs();
  }, [isSecureDocsOpen, onSecureDocsClose, openSecureDocs]);

  // ============================================================================
  // THEME MANAGEMENT
  // ============================================================================
  
  /**
   * Synchronize Chakra UI color mode with application settings
   * This ensures consistent theming across the entire application
   */
  useEffect(() => {
    setColorMode(settings.theme);
  }, [settings.theme, setColorMode]);

  // ============================================================================
  // CREDENTIAL AND DATA LOADING
  // ============================================================================
  
  /**
   * Load initial application data including credentials and database path
   * This runs once when the component mounts and handles the welcome flow
   */
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Add delay to ensure Electron main process is ready
        await sleep(1000);
        
        // Check if Electron APIs are available
        if (!window.electron) {
          console.warn('Electron APIs not available, using default values');
          setIsLoadingEmail(false);
          return;
        }
        
        // Load all credentials in parallel for better performance
        const [emailResult, passwordResult, bbbPasswordResult, webuntisEmailResult, webuntisPasswordResult, schulportalEmailResult, schulportalPasswordResult, schulcloudEncryptionPasswordResult] = await Promise.all([
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'email'
          }).catch(error => {
            console.warn('Error loading email credential:', error);
            return { success: false };
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'password'
          }).catch(error => {
            console.warn('Error loading password credential:', error);
            return { success: false };
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'bbbPassword'
          }).catch(error => {
            console.warn('Error loading BBB password credential:', error);
            return { success: false };
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'webuntisEmail'
          }).catch(error => {
            console.warn('Error loading WebUntis email credential:', error);
            return { success: false };
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'webuntisPassword'
          }).catch(error => {
            console.warn('Error loading WebUntis password credential:', error);
            return { success: false };
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'schulportalEmail'
          }).catch(error => {
            console.warn('Error loading Schulportal email credential:', error);
            return { success: false };
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'schulportalPassword'
          }).catch(error => {
            console.warn('Error loading Schulportal password credential:', error);
            return { success: false };
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'schulcloudEncryptionPassword'
          }).catch(error => {
            console.warn('Error loading encryption password credential:', error);
            return { success: false };
          })
        ]);

        // Load database path for user information
        try {
          const path = await window.electron.getDatabasePath();
          setDbPath(path);
        } catch (error) {
          console.warn('Error loading database path:', error);
        }

        // Set credentials if they exist
        if (emailResult.success && emailResult.password) {
          setEmail(emailResult.password);
        }

        if (passwordResult.success && passwordResult.password) {
          setPassword(passwordResult.password);
        }

        if (bbbPasswordResult.success && bbbPasswordResult.password) {
          setBbbPassword(bbbPasswordResult.password);
        }

        if (webuntisEmailResult.success && webuntisEmailResult.password) {
          setWebuntisEmail(webuntisEmailResult.password);
        }

        if (webuntisPasswordResult.success && webuntisPasswordResult.password) {
          setWebuntisPassword(webuntisPasswordResult.password);
        }

        if (schulportalEmailResult.success && schulportalEmailResult.password) {
          setSchulportalEmail(schulportalEmailResult.password);
        }

        if (schulportalPasswordResult.success && schulportalPasswordResult.password) {
          setSchulportalPassword(schulportalPasswordResult.password);
        }

        if (schulcloudEncryptionPasswordResult.success && schulcloudEncryptionPasswordResult.password) {
          setSchulcloudEncryptionPassword(schulcloudEncryptionPasswordResult.password);
        }

        // Show welcome modal for new users (no email saved)
        if (!emailResult.success || !emailResult.password) {
          // Check if we have credentials in the database fallback
          try {
            const dbCheck = await window.electron.hasDbCredentials({ service: 'bbzcloud' });
            if (dbCheck.success && dbCheck.hasCredentials) {
              setShowPasswordModal(true);
            } else {
              setShowWelcomeModal(true);
            }
          } catch (dbError) {
            console.warn('Error checking DB credentials:', dbError);
            setShowWelcomeModal(true);
          }
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
      } finally {
        setIsLoadingEmail(false);
      }
    };
    loadInitialData();
  }, []);

  // ============================================================================
  // USER ROLE AND NAVIGATION FILTERING
  // ============================================================================
  
  /**
   * Filter navigation buttons based on user role
   * 
   * CUSTOMIZATION: Modify this function to implement your own user role logic
   * Current logic: Teachers (ending with @bbz-rd-eck.de) see all apps,
   * students see only a subset of allowed apps
   * 
   * @returns {Object} Filtered navigation buttons object
   */
  const filterNavigationButtons = useCallback(() => {
    if (!settings.navigationButtons) return {};

    // CUSTOMIZE: Change this logic for your organization's email domains
    const isTeacher = email.endsWith('@bbz-rd-eck.de');

    // Get the schulcloud URL and title based on useBbzChat setting
    const schulcloudUrl = settings.useBbzChat ? URLS.BBZ_CHAT : URLS.SCHULCLOUD;
    const schulcloudTitle = settings.useBbzChat ? 'BBZ Chat' : 'schul.cloud';

    // Update the schulcloud button with the correct URL and title
    const updatedButtons = {
      ...settings.navigationButtons,
      schulcloud: {
        ...settings.navigationButtons.schulcloud,
        url: schulcloudUrl,
        title: schulcloudTitle
      }
    };

    if (isTeacher) {
      return updatedButtons;
    }

    // CUSTOMIZE: Define which apps students/restricted users can access
    const allowedApps = ['schulcloud', 'moodle', 'nextcloud', 'cryptpad', 'webuntis', 'wiki'];
    return Object.entries(updatedButtons)
      .filter(([key]) => allowedApps.includes(key))
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
  }, [email, settings.navigationButtons, settings.useBbzChat]);

  // Pre-compute filtered buttons to avoid recalculation
  const filteredNavigationButtons = filterNavigationButtons();

  // ============================================================================
  // CREDENTIAL MANAGEMENT
  // ============================================================================
  
  /**
   * Handle credential submission during welcome flow
   * Saves credentials securely and reloads the application
   */
  const handleCredentialsSubmit = async () => {
    if (!email) return;

    // Multi-step welcome process
    if (welcomeStep === 1) {
      setWelcomeStep(2);
      return;
    }

    try {
      // Save all credentials in parallel
      await Promise.all([
        window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'email',
          password: email
        }),
        // Only save optional credentials if they exist
        password ? window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'password',
          password: password
        }) : Promise.resolve(),
        bbbPassword ? window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'bbbPassword',
          password: bbbPassword
        }) : Promise.resolve(),
        webuntisEmail ? window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'webuntisEmail',
          password: webuntisEmail
        }) : Promise.resolve(),
        webuntisPassword ? window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'webuntisPassword',
          password: webuntisPassword
        }) : Promise.resolve(),
        schulportalEmail ? window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'schulportalEmail',
          password: schulportalEmail
        }) : Promise.resolve(),
        schulportalPassword ? window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'schulportalPassword',
          password: schulportalPassword
        }) : Promise.resolve(),
        schulcloudEncryptionPassword ? window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'schulcloudEncryptionPassword',
          password: schulcloudEncryptionPassword
        }) : Promise.resolve()
      ]);
      
      // Notify other parts of the app that database has changed
      window.electron.emit('database-changed');
      
      // Close modal and reload to apply changes
      setShowWelcomeModal(false);
      await sleep(2000); // Ensure credentials are saved before reload
      window.location.reload();
    } catch (error) {
      console.error('Error saving credentials:', error);
      toast({
        title: ERROR_MESSAGES.DATABASE_ERROR,
        description: error.message,
        status: 'error',
        duration: UI_CONFIG.TOAST_DURATION,
      });
    }
  };

  /**
   * Handle database password submission for fallback credential recovery
   * Decrypts credentials from DB and restores them to keytar
   */
  const handleDbPasswordSubmit = async () => {
    if (!dbPasswordInput) return;

    setPasswordModalLoading(true);
    setPasswordModalError('');

    try {
      // Set the encryption key in the database service
      const keyResult = await window.electron.setDbEncryptionKey({ password: dbPasswordInput });
      if (!keyResult.success) {
        throw new Error(keyResult.error || 'Fehler beim Setzen des Verschlüsselungsschlüssels');
      }

      // Restore all credentials from DB to keytar
      const restoreResult = await window.electron.restoreCredentialsFromDb({ service: 'bbzcloud' });
      if (!restoreResult.success) {
        throw new Error(restoreResult.error || 'Fehler beim Wiederherstellen der Anmeldedaten');
      }

      // Close modal and reload to apply changes
      setShowPasswordModal(false);
      await sleep(1000);
      window.location.reload();
    } catch (error) {
      console.error('Error decrypting database credentials:', error);
      setPasswordModalError(error.message || 'Falsches Passwort. Bitte versuchen Sie es erneut.');
      setPasswordModalLoading(false);
    }
  };

  // ============================================================================
  // EVENT LISTENERS AND SIDE EFFECTS
  // ============================================================================
  
  /**
   * Listen for application update status
   * Shows a red dot on settings button when updates are available
   */
  useEffect(() => {
    if (!window.electron || !window.electron.onUpdateStatus) {
      return;
    }
    
    try {
      const unsubscribe = window.electron.onUpdateStatus((status) => {
        const isUpdateAvailable = status.includes('verfügbar') || status.includes('heruntergeladen');
        setHasUpdate(isUpdateAvailable);
      });

      return () => unsubscribe();
    } catch (error) {
      console.warn('Error setting up update status listener:', error);
    }
  }, []);

  /**
   * Load application icon for the header
   */
  useEffect(() => {
    if (!window.electron || !window.electron.getAssetPath) {
      return;
    }
    
    const loadAppIcon = async () => {
      try {
        const iconPath = await window.electron.getAssetPath('icon.png');
        setAppIconPath(iconPath);
        const logoPath = await window.electron.getAssetPath('logo.png');
        setAppLogoPath(logoPath);
      } catch (error) {
        console.warn('Error loading app icon:', error);
      }
    };
    loadAppIcon();
  }, []);

  /**
   * Listen for database changes and reload webviews accordingly
   */
  useEffect(() => {
    if (!window.electron || !window.electron.on) {
      return;
    }
    
    try {
      const unsubscribe = window.electron.on('database-changed', () => {
        if (webViewRef.current) {
          webViewRef.current.reload();
        }
      });
      return () => unsubscribe();
    } catch (error) {
      console.warn('Error setting up database change listener:', error);
    }
  }, []);

  /**
   * Set default active webview when navigation buttons are loaded
   */
  useEffect(() => {
    if (!activeWebView && settings.navigationButtons) {
      const filteredButtons = filterNavigationButtons();
      const firstVisibleApp = Object.entries(filteredButtons)
        .find(([_, config]) => config.visible);
      
      if (firstVisibleApp) {
        const [id, config] = firstVisibleApp;
        const webviewId = id.toLowerCase(); // Ensure consistent casing
        setActiveWebView({
          id: webviewId,
          url: config.url,
          title: config.title,
        });
        setCurrentUrl(config.url);
      }
    }
  }, [settings.navigationButtons, activeWebView, filterNavigationButtons]);

  // ============================================================================
  // KEYBOARD SHORTCUTS SETUP
  // ============================================================================
  
  // Prepare navigation items for keyboard shortcuts
  const navigationItems = Object.entries(filteredNavigationButtons)
    .filter(([_, config]) => config.visible)
    .map(([id, config]) => ({ id, ...config }));

  // Application-level keyboard shortcuts
  useAppShortcuts({
    onToggleTodo: toggleTodo,
    onToggleSecureDocs: toggleSecureDocs,
    onOpenSettings: toggleSettings,
    onOpenCommandPalette: onCommandPaletteToggle,
    onReloadCurrent: () => {
      if (webViewRef.current) {
        webViewRef.current.reload();
      }
    },
    onReloadAll: () => {
      // Reload all webviews in the application
      const webviews = document.querySelectorAll('webview');
      webviews.forEach(webview => webview.reload());
      announceToScreenReader('Alle Webviews werden neu geladen');
    },
  });

  // Shortcuts modal keyboard shortcut (Ctrl+Shift+?)
  useEffect(() => {
    const handleShortcutsShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '?' && event.shiftKey) {
        event.preventDefault();
        onShortcutsToggle();
      }
    };

    document.addEventListener('keydown', handleShortcutsShortcut);
    return () => document.removeEventListener('keydown', handleShortcutsShortcut);
  }, [onShortcutsToggle]);

  // Debug mode shortcut (Shift+Alt+Ctrl+D)
  useEffect(() => {
    const handleDebugShortcut = (event) => {
      if (event.ctrlKey && event.shiftKey && event.altKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setIsDebugMode(!isDebugMode);
        console.log('[Debug Console]', isDebugMode ? 'Disabled' : 'Enabled');
      }
    };

    document.addEventListener('keydown', handleDebugShortcut);
    return () => document.removeEventListener('keydown', handleDebugShortcut);
  }, [isDebugMode]);

  // Navigation shortcuts (Ctrl+1-9 for quick app switching)
  useNavigationShortcuts(
    (item) => handleNavigationClick(item.id, false),
    navigationItems
  );

  // Modal/Drawer shortcuts (Escape to close)
  useModalShortcuts(onSettingsClose, isSettingsOpen);
  useModalShortcuts(onTodoClose, isTodoOpen);
  useModalShortcuts(onSecureDocsClose, isSecureDocsOpen);
  useModalShortcuts(onCommandPaletteClose, isCommandPaletteOpen);
  useModalShortcuts(onShortcutsClose, isShortcutsOpen);

  // ============================================================================
  // ACCESSIBILITY FEATURES
  // ============================================================================
  
  /**
   * Focus management for settings drawer
   * Saves and restores focus for screen reader users
   */
  useEffect(() => {
    if (isSettingsOpen) {
      saveFocus();
      announceToScreenReader('Einstellungen geöffnet');
    } else {
      restoreFocus();
    }
  }, [isSettingsOpen]);

  /**
   * Focus management for todo drawer
   */
  useEffect(() => {
    if (isTodoOpen) {
      saveFocus();
      announceToScreenReader('Todo-Liste geöffnet');
    } else {
      restoreFocus();
    }
  }, [isTodoOpen]);

  /**
   * Focus management for secure documents drawer
   */
  useEffect(() => {
    if (isSecureDocsOpen) {
      saveFocus();
      announceToScreenReader('Sichere Dokumente geöffnet');
    } else {
      restoreFocus();
    }
  }, [isSecureDocsOpen]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  
  /**
   * Handle navigation button clicks
   * Supports both regular clicks and Ctrl+click for external browser
   * 
   * @param {string} buttonId - ID of the clicked navigation button
   * @param {boolean} isCtrlPressed - Whether Ctrl key was held during click
   */
  const handleNavigationClick = (buttonId, isCtrlPressed) => {
    const filteredButtons = filterNavigationButtons();
    const buttonConfig = filteredButtons[buttonId.toLowerCase()];
    
    if (buttonConfig) {
      if (isCtrlPressed) {
        // Open in external browser
        window.electron.shell.openExternal(buttonConfig.url);
      } else {
        // Open in internal webview
        const webviewId = buttonId.toLowerCase();
        setActiveWebView({
          id: webviewId,
          url: buttonConfig.url,
          title: buttonConfig.title,
        });
        setCurrentUrl(buttonConfig.url);
      }
    }
  };

  /**
   * Handle custom app clicks from the apps menu
   * 
   * @param {Object} app - Custom app object with id, url, and title
   */
  const handleCustomAppClick = (app) => {
    const webviewId = app.id.toLowerCase();
    setActiveWebView({
      id: webviewId,
      url: app.url,
      title: app.title,
    });
    setCurrentUrl(app.url);
  };

  /**
   * Open URL in a new external window
   * 
   * @param {string} url - URL to open
   * @param {string} title - Window title
   */
  const handleOpenInNewWindow = (url, title) => {
    window.electron.openExternalWindow({ url, title });
  };

  /**
   * Handle webview navigation actions (back, forward, reload)
   * 
   * @param {string} action - Navigation action to perform
   */
  const handleWebViewNavigation = (action) => {
    if (webViewRef.current) {
      webViewRef.current[action]();
    }
  };

  /**
   * Copy current URL to clipboard
   */
  const handleCopyUrl = () => {
    if (currentUrl) {
      navigator.clipboard.writeText(currentUrl);
      toast({
        title: SUCCESS_MESSAGES.LINK_COPIED,
        status: 'success',
        duration: UI_CONFIG.NOTIFICATION_DURATION,
        isClosable: true,
      });
    }
  };

  /**
   * Handle keyboard shortcuts from WebViews
   * This function is called by the injected WebView scripts
   * 
   * @param {string} action - The shortcut action to perform
   * @param {string} shortcut - The shortcut string that was pressed
   */
  const handleWebViewShortcut = useCallback((action, shortcut) => {
    switch (action) {
      case 'COMMAND_PALETTE':
        onCommandPaletteToggle();
        break;
      case 'TOGGLE_TODO':
        toggleTodo();
        break;
      case 'TOGGLE_SECURE_DOCS':
        toggleSecureDocs();
        break;
      case 'OPEN_SETTINGS':
        toggleSettings();
        break;
      case 'RELOAD_CURRENT':
        if (webViewRef.current) {
          webViewRef.current.reload();
        }
        break;
      case 'RELOAD_ALL':
        const webviews = document.querySelectorAll('webview');
        webviews.forEach(webview => webview.reload());
        announceToScreenReader('Alle Webviews werden neu geladen');
        break;
      case 'TOGGLE_FULLSCREEN':
        if (window.electron && window.electron.toggleFullscreen) {
          window.electron.toggleFullscreen();
        }
        break;
      default:
        if (action.startsWith('NAV_')) {
          const index = parseInt(action.split('_')[1]) - 1;
          const filteredButtons = filterNavigationButtons();
          const navigationItems = Object.entries(filteredButtons)
            .filter(([_, config]) => config.visible)
            .map(([id, config]) => ({ id, ...config }));
          
          if (navigationItems[index]) {
            handleNavigationClick(navigationItems[index].id, false);
          }
        }
        break;
    }
  }, [onCommandPaletteToggle, toggleTodo, toggleSecureDocs, toggleSettings, webViewRef, filterNavigationButtons, handleNavigationClick]);

  // Make handleWebViewShortcut available globally for WebView scripts
  useEffect(() => {
    window.handleWebViewShortcut = handleWebViewShortcut;
    
    return () => {
      delete window.handleWebViewShortcut;
    };
  }, [handleWebViewShortcut]);

  // Listen for webview shortcuts from main process
  useEffect(() => {
    if (!window.electron || !window.electron.onMessage) {
      return;
    }
    
    try {
      const unsubscribe = window.electron.onMessage((message) => {
        if (message.type === 'webview-shortcut') {
          const { action } = message;
          switch (action) {
            case 'close-modal':
              // Close any open modals/drawers
              if (isSettingsOpen) onSettingsClose();
              if (isTodoOpen) onTodoClose();
              if (isSecureDocsOpen) onSecureDocsClose();
              if (isCommandPaletteOpen) onCommandPaletteClose();
              break;
            case 'command-palette':
              onCommandPaletteToggle();
              break;
            case 'toggle-todo':
              toggleTodo();
              break;
            case 'toggle-secure-docs':
              toggleSecureDocs();
              break;
            case 'open-settings':
              toggleSettings();
              break;
            case 'reload-current':
              if (webViewRef.current) {
                webViewRef.current.reload();
              }
              break;
            case 'reload-all':
              const webviews = document.querySelectorAll('webview');
              webviews.forEach(webview => webview.reload());
              announceToScreenReader('Alle Webviews werden neu geladen');
              break;
            case 'toggle-fullscreen':
              if (window.electron && window.electron.toggleFullscreen) {
                window.electron.toggleFullscreen();
              }
              break;
            // Handle navigation shortcuts
            case 'nav-app-1':
            case 'nav-app-2':
            case 'nav-app-3':
            case 'nav-app-4':
            case 'nav-app-5':
            case 'nav-app-6':
            case 'nav-app-7':
            case 'nav-app-8':
            case 'nav-app-9':
              const navIndex = parseInt(action.split('-')[2]) - 1;
              const filteredButtons = filterNavigationButtons();
              const navItems = Object.entries(filteredButtons)
                .filter(([_, config]) => config.visible)
                .map(([id, config]) => ({ id, ...config }));
              
              if (navItems[navIndex]) {
                handleNavigationClick(navItems[navIndex].id, false);
              }
              break;
          }
        }
      });
      return () => unsubscribe();
    } catch (error) {
      console.warn('Error setting up webview shortcut listener:', error);
    }
  }, [isSettingsOpen, onSettingsClose, isTodoOpen, onTodoClose, isSecureDocsOpen, onSecureDocsClose, isCommandPaletteOpen, onCommandPaletteClose, onCommandPaletteOpen, toggleTodo, toggleSecureDocs, toggleSettings]);

  // ============================================================================
  // COMMAND PALETTE — OVERLAY WINDOW WIRING
  // ============================================================================

  // Build a serialisable list of commands (metadata only — actions stay in
  // this process and are dispatched by id when the overlay sends back a
  // `command` action).
  const overlayCommands = useMemo(() => {
    const list = [];

    // Navigation commands (one per visible app)
    Object.entries(filteredNavigationButtons).forEach(([id, config], index) => {
      if (config.visible) {
        list.push({
          id: `nav-${id}`,
          title: config.title,
          description: `Zu ${config.title} navigieren`,
          category: 'Navigation',
          icon: '🔗',
          shortcut: index < 9 ? `Strg+${index + 1}` : null,
        });
      }
    });

    // Application commands
    list.push(
      {
        id: 'open-settings',
        title: 'Einstellungen öffnen',
        description: 'Das Einstellungsmenü öffnen',
        category: 'Anwendung',
        icon: '⚙️',
        shortcut: 'Strg+,',
      },
      {
        id: 'toggle-todo',
        title: 'Todo-Liste umschalten',
        description: 'Todo-Liste öffnen oder schließen',
        category: 'Anwendung',
        icon: '📝',
        shortcut: 'Strg+Shift+T',
      },
      {
        id: 'toggle-secure-docs',
        title: 'Sichere Dokumente umschalten',
        description: 'Sichere Dokumente öffnen oder schließen',
        category: 'Anwendung',
        icon: '🔒',
        shortcut: 'Strg+D',
      },
      {
        id: 'reload-current',
        title: 'Aktuelle Seite neu laden',
        description: 'Die aktuell aktive Webansicht neu laden',
        category: 'WebView',
        icon: '🔄',
        shortcut: 'Strg+R',
      },
      {
        id: 'reload-all',
        title: 'Alle Seiten neu laden',
        description: 'Alle Webansichten in der Anwendung neu laden',
        category: 'WebView',
        icon: '🔄',
        shortcut: 'Strg+Shift+R',
      },
    );

    // Custom apps
    if (settings.customApps) {
      settings.customApps.forEach((app) => {
        list.push({
          id: `custom-${app.id}`,
          title: `${app.title} in neuem Fenster öffnen`,
          description: `${app.title} in einem neuen Fenster öffnen`,
          category: 'Benutzerdefinierte Apps',
          icon: '🚀',
          customAppUrl: app.url,
          customAppTitle: app.title,
        });
      });
    }

    return list;
  }, [filteredNavigationButtons, settings.customApps]);

  // Dispatch a command by id. Called when the overlay sends back a selection.
  const dispatchCommand = useCallback((commandId) => {
    if (commandId.startsWith('nav-')) {
      const navId = commandId.substring(4);
      handleNavigationClick(navId, false);
      return;
    }
    if (commandId.startsWith('custom-')) {
      const customId = commandId.substring(7);
      const app = settings.customApps?.find(a => a.id === customId);
      if (app && window.electron?.openExternalWindow) {
        window.electron.openExternalWindow({ url: app.url, title: app.title });
      }
      return;
    }
    switch (commandId) {
      case 'open-settings':
        openSettings();
        break;
      case 'toggle-todo':
        openTodo();
        break;
      case 'toggle-secure-docs':
        openSecureDocs();
        break;
      case 'reload-current':
        if (webViewRef.current) webViewRef.current.reload();
        break;
      case 'reload-all': {
        const webviews = document.querySelectorAll('webview');
        webviews.forEach(webview => webview.reload());
        announceToScreenReader('Alle Webviews werden neu geladen');
        break;
      }
      default:
        break;
    }
  }, [handleNavigationClick, openSettings, openTodo, openSecureDocs, settings.customApps]);

  // Open/hide the overlay window in response to isCommandPaletteOpen state.
  useEffect(() => {
    if (!window.electron?.overlay) return;
    if (isCommandPaletteOpen) {
      window.electron.overlay.open({
        surface: 'commandPalette',
        commands: overlayCommands,
      });
    } else {
      window.electron.overlay.hide();
    }
  }, [isCommandPaletteOpen, overlayCommands]);

  // Listen for actions from the overlay (command selections, menu items, close requests).
  useEffect(() => {
    if (!window.electron?.overlay) return;
    const unsub = window.electron.overlay.onAction((action) => {
      if (!action) return;
      if (action.type === 'command') {
        dispatchCommand(action.id);
        onCommandPaletteClose();
      } else if (action.type === 'close') {
        onCommandPaletteClose();
      } else if (action.type === 'menu-navigate') {
        if (action.id === 'todo') openTodo();
        else if (action.id === 'secure-documents') openSecureDocs();
      } else if (action.type === 'app-select') {
        handleCustomAppClick(action.app);
      } else if (action.type === 'app-new-window') {
        handleOpenInNewWindow(action.url, action.title);
      }
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchCommand, onCommandPaletteClose, openTodo, openSecureDocs]);

  // The overlay can also close itself (e.g. on blur). Sync our state when that
  // happens so the next toggle reopens it correctly.
  useEffect(() => {
    if (!window.electron?.overlay) return;
    const unsub = window.electron.overlay.onClosed(() => {
      onCommandPaletteClose();
    });
    return unsub;
  }, [onCommandPaletteClose]);

  // ============================================================================
  // RENDER
  // ============================================================================

  // Color values used in multiple places — computed once to satisfy hook rules.
  const sidebarBg = useColorModeValue('white', 'gray.800');
  const sidebarBorderColor = useColorModeValue('gray.200', 'gray.600');
  const updateDotBorderColor = useColorModeValue('white', 'gray.800');

  // Reserved-gutter layout: title for the active right-side panel.
  const activePanelTitle = isSettingsOpen
    ? 'Einstellungen'
    : isTodoOpen
      ? 'Todo-Liste'
      : isSecureDocsOpen
        ? 'Sichere Dokumente'
        : '';
  const isAnyPanelOpen = isSettingsOpen || isTodoOpen || isSecureDocsOpen;
  const closeAllPanels = () => {
    onSettingsClose();
    onTodoClose();
    onSecureDocsClose();
  };

  return (
    <Box h="100vh" display="flex" flexDirection="column" overflow="hidden">
      {/* ========================================================================
          HEADER / NAVIGATION BAR
          ======================================================================== */}
      <Flex
        as="header"
        align="center"
        p={2}
        borderBottom="1px"
        borderColor={settings.theme === 'light' ? 'gray.200' : 'gray.700'}
      >
        {/* Left section - App logo */}
        <Box minW="40px" w="auto" pl={1}>
          {appIconPath && (
            <Image
              src={`file://${appIconPath}`}
              alt="BBZCloud Logo"
              height="28px"
              width="28px"
              objectFit="contain"
              cursor="pointer"
              onClick={() => handleOpenInNewWindow('https://www.bbz-rd-eck.de', 'BBZ Rendsburg-Eckernförde')}
            />
          )}
        </Box>

        {/* Center section - Main navigation */}
        <Box flex="1" display="flex" justifyContent="center" alignItems="center" minW={0}>
          <Box>
            <NavigationBar
              buttons={filteredNavigationButtons}
              onButtonClick={handleNavigationClick}
              onNewWindow={handleOpenInNewWindow}
            />
          </Box>
        </Box>

        {/* Right section - Tools and settings */}
        <Box minW="auto" pr={2} overflow="hidden">
          <Flex justify="flex-end" align="center" gap={1} flexShrink={1} minW={0} flexWrap="nowrap">
            {/* Custom apps menu */}
            <CustomAppsMenu
              apps={settings.customApps}
              standardApps={settings.standardApps}
            />

            {/* WebView navigation controls - only shown when a webview is active */}
            {activeWebView && (
              <Flex gap={1} flexShrink={1} minW={0}>
                <ButtonGroup size="sm" isAttached variant="outline">
                  <IconButton
                    icon={<span>←</span>}
                    onClick={() => handleWebViewNavigation('goBack')}
                    aria-label="Zurück"
                    height="28px"
                  />
                  <IconButton
                    icon={<span>→</span>}
                    onClick={() => handleWebViewNavigation('goForward')}
                    aria-label="Vorwärts"
                    height="28px"
                  />
                  <IconButton
                    icon={<span>↻</span>}
                    onClick={() => handleWebViewNavigation('reload')}
                    aria-label="Neu laden"
                    height="28px"
                  />
                </ButtonGroup>

                <IconButton
                  icon={<span>📋</span>}
                  onClick={handleCopyUrl}
                  aria-label="Link kopieren"
                  height="28px"
                  variant="outline"
                />

                <IconButton
                  icon={<span>🖨️</span>}
                  onClick={() => webViewRef.current?.print()}
                  aria-label="Drucken"
                  height="28px"
                  variant="outline"
                />
              </Flex>
            )}

            {/* Documents menu (Todo and Secure Documents) */}
            <DocumentsMenu reminderCount={reminderCount} />

            {/* Settings button with update indicator */}
            <ButtonGroup size="sm" position="relative">
              <IconButton
                aria-label="Einstellungen öffnen"
                icon={<span>⚙️</span>}
                onClick={openSettings}
                variant="ghost"
                height="28px"
              />
              {/* Update indicator dot */}
              <Box
                position="absolute"
                top="-2px"
                right="-2px"
                width="10px"
                height="10px"
                borderRadius="full"
                bg="red.500"
                border="2px solid"
                borderColor={updateDotBorderColor}
                display={hasUpdate ? 'block' : 'none'}
              />
            </ButtonGroup>
          </Flex>
        </Box>
      </Flex>

      {/* ========================================================================
          MAIN CONTENT AREA — RESERVED-GUTTER LAYOUT
          The WebViewContainer fills the remaining space; when a side panel
          (Settings, Todo, SecureDocs) is open it appears as a flex sibling and
          shrinks the WCV bounds instead of overlaying them. This prevents the
          WebContentsView (which sits *above* the React DOM) from covering
          drawer content.
          ======================================================================== */}
      <Flex flex="1" overflow="hidden" direction="row">
        <Box flex="1" position="relative" overflow="hidden" minW={0}>
          {!isLoadingEmail && !showWelcomeModal && !showPasswordModal && (
            <WebViewContainer
              ref={webViewRef}
              activeWebView={activeWebView}
              standardApps={filteredNavigationButtons}
              onNavigate={(url) => {
                setCurrentUrl(url);
                if (activeWebView) {
                  setActiveWebView({
                    ...activeWebView,
                    url,
                  });
                }
              }}
            />
          )}
          {showWelcomeModal && (
            <Center h="100%" bg={getWelcomeBg(colorMode)}>
              <VStack spacing={8}>
                {appLogoPath ? (
                  <Image
                    src={`file://${appLogoPath}`}
                    alt="BBZ Cloud Logo"
                    maxW="320px"
                    maxH="120px"
                    objectFit="contain"
                    opacity={0.85}
                  />
                ) : (
                  <Text fontSize="2xl" fontWeight="bold" color={getWelcomeTextColor(colorMode)}>
                    BBZ Cloud
                  </Text>
                )}
                <Spinner
                  thickness="3px"
                  speed="0.8s"
                  emptyColor={getWelcomeSpinnerEmpty(colorMode)}
                  color="blue.500"
                  size="lg"
                />
              </VStack>
            </Center>
          )}
        </Box>

        {/* Side panel — only one open at a time */}
        {isAnyPanelOpen && (
          <Box
            w="450px"
            h="100%"
            flexShrink={0}
            bg={sidebarBg}
            borderLeft="1px"
            borderColor={sidebarBorderColor}
            display="flex"
            flexDirection="column"
          >
            <Flex
              justify="space-between"
              align="center"
              p={2}
              pl={4}
              borderBottom="1px"
              borderColor={sidebarBorderColor}
              flexShrink={0}
            >
              <Text fontWeight="semibold">{activePanelTitle}</Text>
              <IconButton
                icon={<CloseIcon />}
                size="sm"
                variant="ghost"
                onClick={closeAllPanels}
                aria-label={`${activePanelTitle} schließen`}
              />
            </Flex>
            <Box flex="1" overflowY="auto" p={4} minH={0}>
              {isSettingsOpen && (
                <SettingsPanel onClose={onSettingsClose} onOpenShortcuts={onShortcutsOpen} />
              )}
              {isTodoOpen && (
                <TodoList isVisible={isTodoOpen} onReminderCountChange={setReminderCount} />
              )}
              {isSecureDocsOpen && (
                <SecureDocuments isVisible={isSecureDocsOpen} />
              )}
            </Box>
          </Box>
        )}
      </Flex>

      {/* ========================================================================
          COMMAND PALETTE
          The command palette lives in a dedicated frameless overlay
          BrowserWindow (see public/services/OverlayWindow.js) so it can render
          *above* WebContentsView instances. Its lifecycle is driven by
          `isCommandPaletteOpen` state via the useEffects above.
          ======================================================================== */}

      {/* ========================================================================
          DEBUG CONSOLE
          ======================================================================== */}
      <DebugConsole isVisible={isDebugMode} />

      {/* ========================================================================
          SHORTCUTS MODAL
          ======================================================================== */}
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={onShortcutsClose} />

      {/* ========================================================================
          DB PASSWORD MODAL - FALLBACK CREDENTIAL RECOVERY
          ======================================================================== */}
      <Modal isOpen={showPasswordModal} onClose={() => {}} closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Anmeldedaten wiederherstellen</ModalHeader>
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Text>
                Es wurden gespeicherte Anmeldedaten in der Datenbank gefunden.
                Bitte geben Sie Ihr Passwort ein, um diese zu entschlüsseln.
              </Text>
              <FormControl isRequired>
                <FormLabel>Passwort</FormLabel>
                <InputGroup>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={dbPasswordInput}
                    onChange={(e) => setDbPasswordInput(e.target.value)}
                    placeholder="Ihr Passwort"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleDbPasswordSubmit();
                      }
                    }}
                  />
                  <InputRightElement width="4.5rem">
                    <Button h="1.75rem" size="sm" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? 'Verbergen' : 'Zeigen'}
                    </Button>
                  </InputRightElement>
                </InputGroup>
              </FormControl>
              {passwordModalError && (
                <Text color="red.500" fontSize="sm">
                  {passwordModalError}
                </Text>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Flex justify="space-between" width="100%">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowPasswordModal(false);
                  setShowWelcomeModal(true);
                }}
              >
                Neue Anmeldedaten eingeben
              </Button>
              <Button
                colorScheme="blue"
                onClick={handleDbPasswordSubmit}
                isDisabled={!dbPasswordInput}
                isLoading={passwordModalLoading}
              >
                Wiederherstellen
              </Button>
            </Flex>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ========================================================================
          WELCOME MODAL - FIRST-TIME USER SETUP
          ======================================================================== */}
      <Modal isOpen={showWelcomeModal} onClose={() => {}} closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Willkommen bei BBZCloud</ModalHeader>
          <ModalBody>
            <VStack spacing={4}>
              {/* Step 1: Credential Collection */}
              {welcomeStep === 1 && (
                <>
                  <FormControl isRequired>
                    <FormLabel>E-Mail-Adresse</FormLabel>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vorname.nachname@bbz-rd-eck.de oder @sus.bbz-rd-eck.de"
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Passwort</FormLabel>
                    <InputGroup>
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Passwort (optional)"
                      />
                      <InputRightElement width="4.5rem">
                        <Button h="1.75rem" size="sm" onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? 'Verbergen' : 'Zeigen'}
                        </Button>
                      </InputRightElement>
                    </InputGroup>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Passwort für BigBlueButton</FormLabel>
                    <InputGroup>
                      <Input
                        type={showBBBPassword ? 'text' : 'password'}
                        value={bbbPassword}
                        onChange={(e) => setBbbPassword(e.target.value)}
                        placeholder="BBB Passwort (optional)"
                      />
                      <InputRightElement width="4.5rem">
                        <Button h="1.75rem" size="sm" onClick={() => setShowBBBPassword(!showBBBPassword)}>
                          {showBBBPassword ? 'Verbergen' : 'Zeigen'}
                        </Button>
                      </InputRightElement>
                    </InputGroup>
                  </FormControl>

                  <FormControl>
                    <FormLabel>WebUntis Login</FormLabel>
                    <Input
                      type="text"
                      value={webuntisEmail}
                      onChange={(e) => setWebuntisEmail(e.target.value)}
                      placeholder="WebUntis Benutzername (optional)"
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>WebUntis Passwort</FormLabel>
                    <InputGroup>
                      <Input
                        type={showWebuntisPassword ? 'text' : 'password'}
                        value={webuntisPassword}
                        onChange={(e) => setWebuntisPassword(e.target.value)}
                        placeholder="WebUntis Passwort (optional)"
                      />
                      <InputRightElement width="4.5rem">
                        <Button h="1.75rem" size="sm" onClick={() => setShowWebuntisPassword(!showWebuntisPassword)}>
                          {showWebuntisPassword ? 'Verbergen' : 'Zeigen'}
                        </Button>
                      </InputRightElement>
                    </InputGroup>
                  </FormControl>

                  {/* Schulportal credentials only for teachers */}
                  {email.endsWith('@bbz-rd-eck.de') && (
                    <>
                      <FormControl>
                        <FormLabel>Schulportal Login</FormLabel>
                        <Input
                          type="text"
                          value={schulportalEmail}
                          onChange={(e) => setSchulportalEmail(e.target.value)}
                          placeholder="Schulportal Benutzername (optional)"
                        />
                      </FormControl>

                      <FormControl>
                        <FormLabel>Schulportal Passwort</FormLabel>
                        <InputGroup>
                          <Input
                            type={showSchulportalPassword ? 'text' : 'password'}
                            value={schulportalPassword}
                            onChange={(e) => setSchulportalPassword(e.target.value)}
                            placeholder="Schulportal Passwort (optional)"
                          />
                          <InputRightElement width="4.5rem">
                            <Button h="1.75rem" size="sm" onClick={() => setShowSchulportalPassword(!showSchulportalPassword)}>
                              {showSchulportalPassword ? 'Verbergen' : 'Zeigen'}
                            </Button>
                          </InputRightElement>
                        </InputGroup>
                      </FormControl>
                    </>
                  )}

                  {/* schul.cloud Verschlüsselungskennwort */}
                  <FormControl>
                    <FormLabel>schul.cloud Verschlüsselungskennwort</FormLabel>
                    <InputGroup>
                      <Input
                        type={showEncryptionPassword ? 'text' : 'password'}
                        value={schulcloudEncryptionPassword}
                        onChange={(e) => setSchulcloudEncryptionPassword(e.target.value)}
                        placeholder="Verschlüsselungskennwort (optional)"
                      />
                      <InputRightElement width="4.5rem">
                        <Button h="1.75rem" size="sm" onClick={() => setShowEncryptionPassword(!showEncryptionPassword)}>
                          {showEncryptionPassword ? 'Verbergen' : 'Zeigen'}
                        </Button>
                      </InputRightElement>
                    </InputGroup>
                  </FormControl>
                </>
              )}

              {welcomeStep === 2 && (
                <>
                  <Text>
                    Wählen Sie einen Speicherort für die Datenbank aus. Hier werden Ihre Einstellungen,
                    ToDos und benutzerdefinierten Apps gespeichert.
                  </Text>
                  <FormControl>
                    <FormLabel>Datenbank-Speicherort</FormLabel>
                    <Input value={dbPath} isReadOnly placeholder="Standardspeicherort" />
                  </FormControl>
                  <Button onClick={async () => {
                    try {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.db';
                      input.style.display = 'none';
                      document.body.appendChild(input);

                      input.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const result = await window.electron.changeDatabaseLocation(file.path);
                          if (result.success) {
                            setDbPath(file.path);
                            toast({
                              title: 'Datenbank-Speicherort festgelegt',
                              status: 'success',
                              duration: 3000,
                            });
                          } else {
                            throw new Error(result.error);
                          }
                        }
                        document.body.removeChild(input);
                      };

                      input.click();
                    } catch (error) {
                      toast({
                        title: 'Fehler beim Festlegen des Speicherorts',
                        description: error.message,
                        status: 'error',
                        duration: 5000,
                      });
                    }
                  }}>
                    Speicherort auswählen
                  </Button>
                </>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Flex justify="space-between" width="100%">
              <Button variant="ghost" onClick={() => setShowWelcomeModal(false)}>
                Überspringen
              </Button>
              {welcomeStep === 1 ? (
                <Button colorScheme="blue" onClick={handleCredentialsSubmit} isDisabled={!email}>
                  Weiter
                </Button>
              ) : (
                <Button colorScheme="blue" onClick={handleCredentialsSubmit}>
                  Fertig
                </Button>
              )}
            </Flex>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

export default App;
