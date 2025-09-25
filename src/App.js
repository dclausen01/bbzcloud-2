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
 * @version 2.0.38
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CloseIcon } from '@chakra-ui/icons';
import {
  Box,
  Flex,
  IconButton,
  useColorMode,
  useColorModeValue,
  useDisclosure,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  ButtonGroup,
  Image,
  Tooltip,
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
} from '@chakra-ui/react';

// Context and Components
import { useSettings } from './context/SettingsContext';
import NavigationBar from './components/NavigationBar';
import WebViewContainer from './components/WebViewContainer';
import SettingsPanel from './components/SettingsPanel';
import CustomAppsMenu from './components/CustomAppsMenu';
import TodoList from './components/TodoList';
import DocumentsMenu from './components/DocumentsMenu';
import SecureDocuments from './components/SecureDocuments';
import CommandPalette from './components/CommandPalette';

// Custom Hooks and Utilities
import { 
  useAppShortcuts, 
  useNavigationShortcuts, 
  useModalShortcuts, 
  useWebViewShortcuts 
} from './hooks/useKeyboardShortcuts';
import { 
  useGlobalAppShortcuts, 
  useGlobalNavigationShortcuts 
} from './hooks/useGlobalKeyboardShortcuts';
import { useEnhancedWebViewShortcuts } from './hooks/useWebViewKeyboardShortcuts';
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
 * Main App Component
 * 
 * This component manages the entire application state and coordinates
 * between different features like navigation, webviews, settings, and user management.
 */
function App() {
  // ============================================================================
  // HOOKS AND STATE MANAGEMENT
  // ============================================================================
  
  const { setColorMode } = useColorMode();
  const { settings } = useSettings();
  const toast = useToast();

  // Welcome Modal State - Handles first-time user setup
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [welcomeStep, setWelcomeStep] = useState(1); // 1: credentials, 2: database location

  // User Credentials State - Stored securely via Electron keytar
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bbbPassword, setBbbPassword] = useState(''); // BigBlueButton password
  const [webuntisEmail, setWebuntisEmail] = useState('');
  const [webuntisPassword, setWebuntisPassword] = useState('');
  
  // Password visibility toggles for form inputs
  const [showPassword, setShowPassword] = useState(false);
  const [showBBBPassword, setShowBBBPassword] = useState(false);
  const [showWebuntisPassword, setShowWebuntisPassword] = useState(false);

  // Application State
  const [isLoadingEmail, setIsLoadingEmail] = useState(true);
  const [dbPath, setDbPath] = useState('');
  const [activeWebView, setActiveWebView] = useState(null);
  const [appIconPath, setAppIconPath] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [hasUpdate, setHasUpdate] = useState(false);
  const [reminderCount, setReminderCount] = useState(0);
  const [contextMenuText, setContextMenuText] = useState('');

  // Refs for WebView management
  const webViewRef = useRef(null);

  // Drawer/Modal state management using Chakra UI's useDisclosure
  const { 
    isOpen: isSettingsOpen, 
    onOpen: onSettingsOpen, 
    onClose: onSettingsClose 
  } = useDisclosure();
  
  const {
    isOpen: isTodoOpen,
    onOpen: onTodoOpen,
    onClose: onTodoClose
  } = useDisclosure();

  const {
    isOpen: isSecureDocsOpen,
    onOpen: onSecureDocsOpen,
    onClose: onSecureDocsClose
  } = useDisclosure();

  const {
    isOpen: isCommandPaletteOpen,
    onOpen: onCommandPaletteOpen,
    onClose: onCommandPaletteClose
  } = useDisclosure();

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
        
        // Load all credentials in parallel for better performance
        const [emailResult, passwordResult, bbbPasswordResult, webuntisEmailResult, webuntisPasswordResult] = await Promise.all([
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'email'
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'password'
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'bbbPassword'
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'webuntisEmail'
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'webuntisPassword'
          })
        ]);

        // Load database path for user information
        const path = await window.electron.getDatabasePath();
        setDbPath(path);

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

        // Show welcome modal for new users (no email saved)
        if (!emailResult.success || !emailResult.password) {
          setShowWelcomeModal(true);
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

    if (isTeacher) {
      return settings.navigationButtons;
    }

    // CUSTOMIZE: Define which apps students/restricted users can access
    const allowedApps = ['schulcloud', 'moodle', 'office', 'cryptpad', 'webuntis', 'wiki'];
    return Object.entries(settings.navigationButtons)
      .filter(([key]) => allowedApps.includes(key))
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
  }, [email, settings.navigationButtons]);

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

  // ============================================================================
  // EVENT LISTENERS AND SIDE EFFECTS
  // ============================================================================
  
  /**
   * Handle todo additions from context menu
   * This allows users to right-click on text and add it as a todo
   */
  useEffect(() => {
    const unsubscribe = window.electron.onAddTodo((text) => {
      setContextMenuText(text);
      onTodoOpen();
    });
    return () => unsubscribe();
  }, [onTodoOpen]);

  /**
   * Clear context menu text when todo drawer closes
   */
  useEffect(() => {
    if (!isTodoOpen) {
      setContextMenuText('');
    }
  }, [isTodoOpen]);

  /**
   * Listen for application update status
   * Shows a red dot on settings button when updates are available
   */
  useEffect(() => {
    const unsubscribe = window.electron.onUpdateStatus((status) => {
      const isUpdateAvailable = status.includes('verfügbar') || status.includes('heruntergeladen');
      setHasUpdate(isUpdateAvailable);
    });

    return () => unsubscribe();
  }, []);

  /**
   * Load application icon for the header
   */
  useEffect(() => {
    const loadAppIcon = async () => {
      try {
        const iconPath = await window.electron.getAssetPath('icon.png');
        setAppIconPath(iconPath);
      } catch (error) {
        console.error('Fehler beim Laden des App-Icons:', error);
      }
    };
    loadAppIcon();
  }, []);

  /**
   * Listen for database changes and reload webviews accordingly
   */
  useEffect(() => {
    const unsubscribe = window.electron.on('database-changed', () => {
      if (webViewRef.current) {
        webViewRef.current.reload();
      }
    });
    return () => unsubscribe();
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

  // Application-level keyboard shortcuts (Ctrl+T, Ctrl+D, etc.)
  useAppShortcuts({
    onToggleTodo: onTodoOpen,
    onToggleSecureDocs: onSecureDocsOpen,
    onOpenSettings: onSettingsOpen,
    onOpenCommandPalette: onCommandPaletteOpen,
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

  // Navigation shortcuts (Ctrl+1-9 for quick app switching)
  useNavigationShortcuts(
    (item) => handleNavigationClick(item.id, false),
    navigationItems
  );

  // WebView-specific shortcuts (Alt+Left/Right for navigation, F5 for reload, etc.)
  useWebViewShortcuts(webViewRef, !!activeWebView);

  // Modal/Drawer shortcuts (Escape to close)
  useModalShortcuts(onSettingsClose, isSettingsOpen);
  useModalShortcuts(onTodoClose, isTodoOpen);
  useModalShortcuts(onSecureDocsClose, isSecureDocsOpen);

  // Enhanced webview shortcuts that work even when webview has focus
  useEnhancedWebViewShortcuts({
    onOpenCommandPalette: onCommandPaletteOpen,
    onToggleTodo: onTodoOpen,
    onToggleSecureDocs: onSecureDocsOpen,
    onOpenSettings: onSettingsOpen,
    onReloadCurrent: () => {
      if (webViewRef.current) {
        webViewRef.current.reload();
      }
    },
    onReloadAll: () => {
      const webviews = document.querySelectorAll('webview');
      webviews.forEach(webview => webview.reload());
      announceToScreenReader('Alle Webviews werden neu geladen');
    },
    onNavigate: (index) => {
      if (navigationItems[index]) {
        handleNavigationClick(navigationItems[index].id, false);
      }
    },
  });

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

  // ============================================================================
  // RENDER
  // ============================================================================
  
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
              onAppClick={handleCustomAppClick}
              onNewWindow={handleOpenInNewWindow}
            />

            {/* WebView navigation controls - only shown when a webview is active */}
            {activeWebView && (
              <Flex gap={1} flexShrink={1} minW={0}>
                <ButtonGroup size="sm" isAttached variant="outline">
                  <Tooltip label="Zurück" placement="top">
                    <IconButton
                      icon={<span>←</span>}
                      onClick={() => handleWebViewNavigation('goBack')}
                      aria-label="Zurück"
                      height="28px"
                    />
                  </Tooltip>
                  <Tooltip label="Vorwärts" placement="top">
                    <IconButton
                      icon={<span>→</span>}
                      onClick={() => handleWebViewNavigation('goForward')}
                      aria-label="Vorwärts"
                      height="28px"
                    />
                  </Tooltip>
                  <Tooltip label="Neu laden" placement="top">
                    <IconButton
                      icon={<span>↻</span>}
                      onClick={() => handleWebViewNavigation('reload')}
                      aria-label="Neu laden"
                      height="28px"
                    />
                  </Tooltip>
                </ButtonGroup>

                <Tooltip label="Link kopieren" placement="top">
                  <IconButton
                    icon={<span>📋</span>}
                    onClick={handleCopyUrl}
                    aria-label="Link kopieren"
                    height="28px"
                    variant="outline"
                  />
                </Tooltip>

                <Tooltip label="Drucken" placement="top">
                  <IconButton
                    icon={<span>🖨️</span>}
                    onClick={() => webViewRef.current?.print()}
                    aria-label="Drucken"
                    height="28px"
                    variant="outline"
                  />
                </Tooltip>
              </Flex>
            )}

            {/* Documents menu (Todo and Secure Documents) */}
            <DocumentsMenu 
              reminderCount={reminderCount}
              onNavigate={(view) => {
                if (view === 'todo') {
                  onTodoOpen();
                } else if (view === 'secure-documents') {
                  onSecureDocsOpen();
                }
              }} 
            />

            {/* Settings button with update indicator */}
            <ButtonGroup size="sm" position="relative">
              <Tooltip label="Einstellungen" placement="top">
                <IconButton
                  aria-label="Einstellungen öffnen"
                  icon={<span>⚙️</span>}
                  onClick={onSettingsOpen}
                  variant="ghost"
                  height="28px"
                />
              </Tooltip>
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
                borderColor={useColorModeValue('white', 'gray.800')}
                display={hasUpdate ? 'block' : 'none'}
              />
            </ButtonGroup>
          </Flex>
        </Box>
      </Flex>

      {/* ========================================================================
          MAIN CONTENT AREA - WEBVIEW CONTAINER
          ======================================================================== */}
      <Box flex="1" position="relative" overflow="hidden">
        {!isLoadingEmail && (
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
      </Box>

      {/* ========================================================================
          SETTINGS DRAWER
          ======================================================================== */}
      <Drawer isOpen={isSettingsOpen} placement="right" onClose={onSettingsClose} size="md">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton aria-label="Einstellungen schließen" />
          <DrawerHeader>Einstellungen</DrawerHeader>
          <DrawerBody>
            <SettingsPanel onClose={onSettingsClose} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* ========================================================================
          TODO DRAWER
          ======================================================================== */}
      <Box 
        position="fixed" 
        right={0} 
        top="48px" 
        bottom={0} 
        width="450px" 
        bg={useColorModeValue('white', 'gray.800')}
        borderLeft="1px"
        borderColor={useColorModeValue('gray.200', 'gray.600')}
        display={isTodoOpen ? 'block' : 'none'}
        zIndex={1000}
      >
        <Flex direction="column" height="100%">
          <Flex justify="flex-end" p={2} borderBottom="1px" borderColor={useColorModeValue('gray.200', 'gray.600')}>
            <IconButton
              icon={<CloseIcon />}
              size="sm"
              onClick={onTodoClose}
              aria-label="Todo Liste schließen"
            />
          </Flex>
          <Box p={4} overflowY="auto" flex="1">
            <TodoList 
              initialText={contextMenuText} 
              onTextAdded={() => setContextMenuText('')}
              isVisible={isTodoOpen}
              onReminderCountChange={setReminderCount}
            />
          </Box>
        </Flex>
      </Box>

      {/* ========================================================================
          SECURE DOCUMENTS DRAWER
          ======================================================================== */}
      <Box 
        position="fixed" 
        right={0} 
        top="48px" 
        bottom={0} 
        width="450px" 
        bg={useColorModeValue('white', 'gray.800')}
        borderLeft="1px"
        borderColor={useColorModeValue('gray.200', 'gray.600')}
        display={isSecureDocsOpen ? 'block' : 'none'}
        zIndex={1000}
      >
        <Flex direction="column" height="100%">
          <Flex justify="flex-end" p={2} borderBottom="1px" borderColor={useColorModeValue('gray.200', 'gray.600')}>
            <IconButton
              icon={<CloseIcon />}
              size="sm"
              onClick={onSecureDocsClose}
              aria-label="Sichere Dokumente schließen"
            />
          </Flex>
          <Box p={4} overflowY="auto" flex="1">
            <SecureDocuments isVisible={isSecureDocsOpen} />
          </Box>
        </Flex>
      </Box>

      {/* ========================================================================
          COMMAND PALETTE
          ======================================================================== */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={onCommandPaletteClose}
        navigationButtons={filteredNavigationButtons}
        onNavigate={handleNavigationClick}
        onOpenSettings={onSettingsOpen}
        onToggleTodo={onTodoOpen}
        onToggleSecureDocs={onSecureDocsOpen}
        onReloadCurrent={() => {
          if (webViewRef.current) {
            webViewRef.current.reload();
          }
        }}
        onReloadAll={() => {
          const webviews = document.querySelectorAll('webview');
          webviews.forEach(webview => webview.reload());
          announceToScreenReader('Alle Webviews werden neu geladen');
        }}
      />

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
