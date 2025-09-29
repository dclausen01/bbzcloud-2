/**
 * BBZCloud - BrowserView Controller
 * 
 * This component replaces the WebViewContainer and acts as a "remote control"
 * for BrowserViews managed in the main process. It handles:
 * - BrowserView initialization and lifecycle management
 * - State synchronization between React and main process
 * - Loading indicators and error handling
 * - Navigation controls and URL updates
 * - Credential injection coordination
 * 
 * Unlike WebViewContainer, this component doesn't render actual webview DOM elements.
 * Instead, it communicates with the BrowserViewManager via IPC to control
 * BrowserViews that are managed entirely in the main process.
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.0.39
 */

import React, { useRef, useEffect, useState, forwardRef } from 'react';
import {
  Box,
  Flex,
  Progress,
  useToast,
  useColorMode,
  Image as ChakraImage,
  Text,
  Button,
} from '@chakra-ui/react';
import { useSettings } from '../context/SettingsContext';

const BrowserViewController = forwardRef(({ activeWebView, onNavigate, standardApps }, ref) => {
  // State management for BrowserViews
  const [isLoading, setIsLoading] = useState({});
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [overviewImagePath, setOverviewImagePath] = useState('');
  const [imageError, setImageError] = useState(false);
  const [credsAreSet, setCredsAreSet] = useState({});
  const [isStartupPeriod, setIsStartupPeriod] = useState(true);
  const [failedBrowserViews, setFailedBrowserViews] = useState({});
  const [browserViewsInitialized, setBrowserViewsInitialized] = useState(false);
  const [activeBrowserViewId, setActiveBrowserViewId] = useState(null);

  const toast = useToast();
  const { colorMode } = useColorMode();
  const { settings, isLoading: isSettingsLoading } = useSettings();

  // Refs for tracking BrowserViews (for compatibility with existing code)
  const browserViewRefs = useRef({});

  console.log('[BrowserViewController] Rendering with activeWebView:', activeWebView);

  // Expose navigation methods through ref (for compatibility with existing WebViewContainer API)
  React.useImperativeHandle(ref, () => ({
    goBack: async () => {
      if (!activeWebView) return;
      
      try {
        // Use BrowserView navigation instead of webview methods
        const view = await window.electron.getBrowserViewStats();
        if (view.success && view.stats.activeBrowserView === 'active') {
          // For BrowserViews, we need to handle navigation through the main process
          // This will be handled by keyboard shortcuts or navigation buttons
          console.log('[BrowserViewController] goBack called for:', activeWebView.id);
        }
      } catch (error) {
        console.warn('Error navigating back:', error);
      }
    },
    
    goForward: async () => {
      if (!activeWebView) return;
      
      try {
        const view = await window.electron.getBrowserViewStats();
        if (view.success && view.stats.activeBrowserView === 'active') {
          console.log('[BrowserViewController] goForward called for:', activeWebView.id);
        }
      } catch (error) {
        console.warn('Error navigating forward:', error);
      }
    },
    
    reload: async () => {
      if (!activeWebView) return;
      
      try {
        const result = await window.electron.reloadBrowserView(activeWebView.id);
        if (result.success) {
          console.log('[BrowserViewController] Reloaded BrowserView:', activeWebView.id);
        } else {
          console.error('[BrowserViewController] Failed to reload BrowserView:', result.error);
        }
      } catch (error) {
        console.warn('Error reloading BrowserView:', error);
      }
    },
    
    print: async () => {
      if (!activeWebView) return;
      
      try {
        // Printing will be handled by keyboard shortcuts in the BrowserView
        console.log('[BrowserViewController] print called for:', activeWebView.id);
      } catch (error) {
        console.warn('Error printing BrowserView:', error);
      }
    }
  }));

  // Translate error codes to user-friendly German messages
  const getErrorMessage = (error) => {
    switch (error.code) {
      case -2:
        return 'Die Verbindung wurde unterbrochen';
      case -3:
        return 'Der Server konnte nicht gefunden werden';
      case -6:
        return 'Die Verbindung wurde zurückgesetzt';
      case -7:
        return 'Die Serververbindung ist fehlgeschlagen';
      case -21:
        return 'Die Netzwerkverbindung wurde getrennt';
      case -105:
        return 'Die Server-Adresse konnte nicht aufgelöst werden';
      case -106:
        return 'Das Internet ist nicht verfügbar';
      case -109:
        return 'Die Serververbindung wurde abgelehnt';
      case -201:
        return 'Die Webseite konnte nicht sicher aufgerufen werden';
      case -202:
        return 'Die Verbindung ist nicht sicher';
      default:
        return 'Die Seite konnte nicht geladen werden';
    }
  };

  // Disable error toasts for first 15 seconds after startup
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsStartupPeriod(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, []);

  // Retry loading a specific BrowserView
  const handleRetryBrowserView = async (id) => {
    try {
      const result = await window.electron.reloadBrowserView(id);
      if (result.success) {
        setFailedBrowserViews(prev => {
          const newState = { ...prev };
          delete newState[id];
          return newState;
        });
        console.log('[BrowserViewController] Retried BrowserView:', id);
      }
    } catch (error) {
      console.error('Error retrying BrowserView:', error);
    }
  };

  // Initialize standard apps as BrowserViews
  useEffect(() => {
    const initializeBrowserViews = async () => {
      if (browserViewsInitialized || isSettingsLoading || !standardApps || Object.keys(standardApps).length === 0) {
        return;
      }

      try {
        console.log('[BrowserViewController] Initializing standard apps as BrowserViews...');
        
        const result = await window.electron.initStandardAppsBrowserViews(standardApps);
        
        if (result.success) {
          setBrowserViewsInitialized(true);
          console.log('[BrowserViewController] Successfully initialized standard apps as BrowserViews');
          
          // Create refs for compatibility
          Object.keys(standardApps).forEach(id => {
            if (standardApps[id].visible) {
              browserViewRefs.current[id] = { current: { id } }; // Mock ref for compatibility
            }
          });
        } else {
          console.error('[BrowserViewController] Failed to initialize standard apps:', result.error);
        }
      } catch (error) {
        console.error('[BrowserViewController] Error initializing BrowserViews:', error);
      }
    };

    initializeBrowserViews();
  }, [standardApps, isSettingsLoading, browserViewsInitialized]);

  // Handle active BrowserView changes
  useEffect(() => {
    if (activeWebView && browserViewsInitialized) {
      const showBrowserView = async () => {
        try {
          console.log('[BrowserViewController] Showing BrowserView:', activeWebView.id);
          
          const result = await window.electron.showBrowserView(activeWebView.id);
          
          if (result.success) {
            setActiveBrowserViewId(activeWebView.id);
            
            // Get current URL and notify parent
            const urlResult = await window.electron.getBrowserViewURL(activeWebView.id);
            if (urlResult.success && urlResult.url) {
              onNavigate(urlResult.url);
            }
          } else {
            console.error('[BrowserViewController] Failed to show BrowserView:', result.error);
          }
        } catch (error) {
          console.error('[BrowserViewController] Error showing BrowserView:', error);
        }
      };

      showBrowserView();
    }
  }, [activeWebView, browserViewsInitialized, onNavigate]);

  // Set up BrowserView event listeners
  useEffect(() => {
    if (!window.electron) return;

    // Loading state listeners
    const unsubscribeLoading = window.electron.onBrowserViewLoading((data) => {
      const { id, loading } = data;
      setIsLoading(prev => ({ ...prev, [id]: loading }));
      console.log(`[BrowserViewController] ${id} loading state:`, loading);
    });

    const unsubscribeLoaded = window.electron.onBrowserViewLoaded((data) => {
      const { id, url } = data;
      setIsLoading(prev => ({ ...prev, [id]: false }));
      console.log(`[BrowserViewController] ${id} loaded:`, url);
      
      // Update URL if this is the active BrowserView
      if (activeWebView && activeWebView.id === id) {
        onNavigate(url);
      }
    });

    const unsubscribeNavigated = window.electron.onBrowserViewNavigated((data) => {
      const { id, url } = data;
      console.log(`[BrowserViewController] ${id} navigated to:`, url);
      
      // Update URL if this is the active BrowserView
      if (activeWebView && activeWebView.id === id) {
        onNavigate(url);
      }
    });

    const unsubscribeError = window.electron.onBrowserViewError((data) => {
      const { id, error } = data;
      setIsLoading(prev => ({ ...prev, [id]: false }));
      
      if (!isStartupPeriod && error.code < -3) {
        const errorMessage = getErrorMessage(error);
        setFailedBrowserViews(prev => ({
          ...prev,
          [id]: {
            error: errorMessage,
            timestamp: new Date().toISOString()
          }
        }));

        const toastId = `error-${id}-${Date.now()}`;
        toast({
          id: toastId,
          title: `Fehler beim Laden von ${standardApps[id]?.title || id}`,
          description: (
            <Flex direction="column" gap={2}>
              <Text>{errorMessage}</Text>
              <Button 
                size="sm" 
                onClick={() => {
                  handleRetryBrowserView(id);
                  toast.close(toastId);
                }}
              >
                Erneut versuchen
              </Button>
            </Flex>
          ),
          status: 'error',
          duration: null,
          isClosable: true,
        });
      }
    });

    const unsubscribeActivated = window.electron.onBrowserViewActivated((data) => {
      const { id } = data;
      setActiveBrowserViewId(id);
      console.log('[BrowserViewController] BrowserView activated:', id);
    });

    const unsubscribeNewWindow = window.electron.onBrowserViewNewWindow((data) => {
      const { url, title } = data;
      console.log('[BrowserViewController] New window requested:', url);
      // Handle new window creation if needed
      window.electron.openExternalWindow({ url, title });
    });

    const unsubscribeContextMenu = window.electron.onBrowserViewContextMenu((data) => {
      const { id, selectionText, x, y } = data;
      console.log('[BrowserViewController] Context menu:', { id, selectionText });
      // Handle context menu if needed
    });

    // Listen for BrowserView messages (including debug keyboard events)
    const unsubscribeMessages = window.electron.onBrowserViewMessage((message) => {
      if (message.type === 'debug-keyboard-event') {
        // Forward to main window for debug tool
        console.log('[BrowserViewController] Debug keyboard event:', message);
      }
    });

    // Listen for credential injection results
    const unsubscribeCredentials = window.electron.onCredentialInjectionResult((data) => {
      const { service, success, browserViewId } = data;
      console.log(`[BrowserViewController] Credential injection result: ${service} -> ${success} (${browserViewId})`);
      
      if (success) {
        setCredsAreSet(prev => ({ ...prev, [browserViewId]: true }));
      }
    });

    // Cleanup function
    return () => {
      unsubscribeLoading();
      unsubscribeLoaded();
      unsubscribeNavigated();
      unsubscribeError();
      unsubscribeActivated();
      unsubscribeNewWindow();
      unsubscribeContextMenu();
      unsubscribeMessages();
      unsubscribeCredentials();
    };
  }, [activeWebView, onNavigate, isStartupPeriod, standardApps, toast]);

  // Listen for download progress (same as WebViewContainer)
  useEffect(() => {
    if (!window.electron || !window.electron.onDownloadProgress) {
      return;
    }
    
    try {
      const unsubscribe = window.electron.onDownloadProgress((progress) => {
        if (progress === 'completed' || progress === 'failed' || progress === 'interrupted') {
          setDownloadProgress(null);
        } else if (progress === 'paused') {
          setDownloadProgress('paused');
        } else if (typeof progress === 'number') {
          setDownloadProgress(progress);
        }
      });
      return () => unsubscribe();
    } catch (error) {
      console.warn('Error setting up download progress listener:', error);
    }
  }, []);

  // Load overview image
  useEffect(() => {
    const loadOverviewImage = async () => {
      try {
        const imagePath = await window.electron.resolveAssetPath('uebersicht.png');
        setOverviewImagePath(imagePath);
        setImageError(false);
      } catch (error) {
        setImageError(true);
      }
    };

    loadOverviewImage();
  }, []);

  // Helper to check if an app is from the dropdown (not in standardApps)
  const isDropdownApp = (id) => {
    return !Object.keys(standardApps).includes(id.toLowerCase());
  };

  // Handle dynamic BrowserView creation for dropdown apps
  useEffect(() => {
    const createDynamicBrowserView = async () => {
      if (!activeWebView || !isDropdownApp(activeWebView.id) || !browserViewsInitialized) {
        return;
      }

      try {
        console.log('[BrowserViewController] Creating dynamic BrowserView for:', activeWebView.id);
        
        const result = await window.electron.createBrowserView(
          activeWebView.id, 
          activeWebView.url, 
          { title: activeWebView.title }
        );
        
        if (result.success) {
          // Show the newly created BrowserView
          const showResult = await window.electron.showBrowserView(activeWebView.id);
          if (showResult.success) {
            setActiveBrowserViewId(activeWebView.id);
            console.log('[BrowserViewController] Dynamic BrowserView created and shown:', activeWebView.id);
          }
        } else {
          console.error('[BrowserViewController] Failed to create dynamic BrowserView:', result.error);
        }
      } catch (error) {
        console.error('[BrowserViewController] Error creating dynamic BrowserView:', error);
      }
    };

    createDynamicBrowserView();
  }, [activeWebView, browserViewsInitialized]);

  // Show overview image when no active view
  if (!activeWebView && !Object.keys(standardApps).length) {
    return (
      <Flex
        h="100%"
        w="100%"
        align="center"
        justify="center"
        bg={colorMode === 'light' ? 'gray.50' : 'gray.800'}
        overflow="hidden"
      >
        {!imageError && overviewImagePath && (
          <Box
            w="100%"
            h="100%"
            display="flex"
            alignItems="center"
            justifyContent="center"
            overflow="hidden"
          >
            <ChakraImage
              src={overviewImagePath}
              alt="Übersicht"
              maxH="90%"
              maxW="90%"
              objectFit="contain"
              borderRadius="md"
              boxShadow="lg"
              onError={() => {
                setImageError(true);
                toast({
                  title: 'Fehler beim Laden des Übersichtsbildes',
                  status: 'error',
                  duration: 5000,
                  isClosable: true,
                });
              }}
            />
          </Box>
        )}
        {imageError && (
          <Text color="gray.500">
            Willkommen bei BBZCloud
          </Text>
        )}
      </Flex>
    );
  }

  return (
    <Box h="100%" w="100%" position="relative" overflow="hidden">
      {/* Download Progress */}
      {downloadProgress !== null && (
        <Box
          position="fixed"
          bottom="4"
          right="4"
          width="300px"
          bg={colorMode === 'light' ? 'white' : 'gray.700'}
          color={colorMode === 'light' ? 'gray.800' : 'white'}
          boxShadow="lg"
          borderRadius="md"
          p="3"
          zIndex={9999}
        >
          <Text mb="2" fontSize="sm">
            {downloadProgress === 'paused' ? 'Download pausiert' : 'Download läuft...'}
          </Text>
          <Progress
            value={downloadProgress === 'paused' ? 0 : downloadProgress}
            size="sm"
            colorScheme="blue"
            isIndeterminate={downloadProgress === -1}
          />
        </Box>
      )}

      {/* Loading indicators for active BrowserView */}
      {activeWebView && isLoading[activeWebView.id] && (
        <Progress
          size="xs"
          isIndeterminate
          position="absolute"
          top="0"
          left="0"
          right="0"
          zIndex="1"
        />
      )}

      {/* BrowserViews are managed in the main process - no DOM elements here */}
      {/* This component acts as a "remote control" for BrowserViews */}
      
      {/* Debug information */}
      {process.env.NODE_ENV === 'development' && (
        <Box
          position="absolute"
          top="20px"
          right="20px"
          bg="rgba(0,0,0,0.8)"
          color="white"
          p="2"
          borderRadius="md"
          fontSize="xs"
          zIndex="999"
        >
          <Text>Active BrowserView: {activeBrowserViewId || 'none'}</Text>
          <Text>Initialized: {browserViewsInitialized ? 'yes' : 'no'}</Text>
          <Text>Standard Apps: {Object.keys(standardApps).length}</Text>
        </Box>
      )}
    </Box>
  );
});

BrowserViewController.displayName = 'BrowserViewController';

export default BrowserViewController;
