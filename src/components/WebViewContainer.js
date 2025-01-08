/* eslint-disable default-case */
import React, { useRef, useEffect, useState, forwardRef, useCallback } from 'react';
import {
  Box,
  Flex,
  Progress,
  useToast,
  useColorMode,
  Image as ChakraImage,
  Text,
} from '@chakra-ui/react';
import { useSettings } from '../context/SettingsContext';

const WebViewContainer = forwardRef(({ activeWebView, onNavigate, standardApps }, ref) => {
  // Expose navigation methods through ref
  React.useImperativeHandle(ref, () => ({
    goBack: () => {
      const webview = activeWebView && (
        webviewRefs.current[activeWebView.id]?.current ||
        document.querySelector(`#wv-${activeWebView.id}`)
      );
      if (webview && webview.canGoBack()) {
        webview.goBack();
      }
    },
    goForward: () => {
      const webview = activeWebView && (
        webviewRefs.current[activeWebView.id]?.current ||
        document.querySelector(`#wv-${activeWebView.id}`)
      );
      if (webview && webview.canGoForward()) {
        webview.goForward();
      }
    },
    reload: () => {
      const webview = activeWebView && (
        webviewRefs.current[activeWebView.id]?.current ||
        document.querySelector(`#wv-${activeWebView.id}`)
      );
      if (webview) {
        webview.reload();
      }
    }
  }));
  const webviewRefs = useRef({});
  const [isLoading, setIsLoading] = useState({});
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [overviewImagePath, setOverviewImagePath] = useState('');
  const [imageError, setImageError] = useState(false);
  const [credsAreSet, setCredsAreSet] = useState({});
  const [isStartupPeriod, setIsStartupPeriod] = useState(true);

  // Disable error toasts for first 15 seconds after startup
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsStartupPeriod(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, []);
  const toast = useToast();
  const { colorMode, setColorMode } = useColorMode();
  const { settings, isLoading: isSettingsLoading } = useSettings();
  const notificationCheckIntervalRef = useRef(null);

  // Apply zoom level to a webview
  const applyZoom = useCallback(async (webview, id) => {
    if (!webview) return;

    try {
      const zoomFactor = settings.globalZoom;
      
      // Get webContentsId from webview
      const webContentsId = await webview.getWebContentsId();
      if (webContentsId) {
        await window.electron.setZoomFactor(webContentsId, zoomFactor);
      }
    } catch (error) {
      console.error(`Error setting zoom for ${id}:`, error);
    }
  }, [settings.globalZoom]);

  // Update zoom levels when settings change or finish loading
  useEffect(() => {
    if (!isSettingsLoading) {  // Only apply zoom when settings are loaded
      Object.entries(webviewRefs.current).forEach(([id, ref]) => {
        if (ref.current) {
          applyZoom(ref.current, id);
        }
      });
    }
  }, [settings.globalZoom, standardApps, applyZoom, isSettingsLoading]);

  // Listen for theme changes from main process
  useEffect(() => {
    const unsubscribe = window.electron.onThemeChanged((theme) => {
      setColorMode(theme);
    });
    return () => unsubscribe();
  }, [setColorMode]);

  // Listen for download progress
  useEffect(() => {
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
  }, []);

  // Listen for system resume events
  useEffect(() => {
    const unsubscribe = window.electron.onSystemResumed((webviewsToReload) => {
      webviewsToReload.forEach(id => {
        const webview = webviewRefs.current[id]?.current;
        if (webview) {
          webview.reload();
          console.log(`Reloading webview: ${id}`);
        }
      });
    });
    return () => unsubscribe();
  }, []);

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

  useEffect(() => {
    // Initialize webviews for all standard apps
    Object.entries(standardApps).forEach(([id, config]) => {
      if (config.visible && !webviewRefs.current[id]) {
        webviewRefs.current[id] = React.createRef();
      }
    });
  }, [standardApps]);

  // Helper function to check if favicon indicates new messages
  const checkForNotifications = (base64Image) => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, img.width, img.height);
        
        // Get lower right quadrant
        const imageData = ctx.getImageData(
          Math.floor(img.width * 0.5),  // Start at 60% of width
          Math.floor(img.height * 0.5), // Start at 60% of height
          Math.floor(img.width * 0.5),  // Check remaining 40%
          Math.floor(img.height * 0.5)  // Check remaining 40%
        ).data;
        
        let redPixelCount = 0;
        let totalPixels = 0;
        
        // Check each pixel in the lower right quadrant
        for (let i = 0; i < imageData.length; i += 4) {
          const red = imageData[i];
          const green = imageData[i + 1];
          const blue = imageData[i + 2];
          const alpha = imageData[i + 3];
          
          // Only count non-transparent pixels
          if (alpha > 200) { // More strict alpha threshold
            totalPixels++;
            // Check if pixel is in the red range (more lenient)
            // Original color is rgb(234, 109, 132)
            if (red > 200 && // High red value
                green > 80 && green < 190 && // Medium green value
                blue > 100 && blue < 190) { // Medium blue value
              redPixelCount++;
            }
          }
        }
        
        // Calculate percentage of matching pixels
        const redPercentage = totalPixels > 0 ? redPixelCount / totalPixels : 0;
        resolve(redPercentage > 0.4); // More lenient threshold (40% instead of 50%)
      };
      
      img.onerror = function (error) {
        reject(new Error('Failed to load favicon'));
      };
      
      img.src = base64Image;
    });
  };

  // Function to inject credentials based on webview ID
  const injectCredentials = useCallback(async (webview, id) => {
    if (!webview || credsAreSet[id]) return;

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      // Get credentials from keytar using the correct service/account names
      const emailResult = await window.electron.getCredentials({
        service: 'bbzcloud',
        account: 'email'
      });

      const passwordResult = await window.electron.getCredentials({
        service: 'bbzcloud',
        account: 'password'
      });

      const bbbPasswordResult = id === 'bbb' ? await window.electron.getCredentials({
        service: 'bbzcloud',
        account: 'bbbPassword'
      }) : null;

      if (!emailResult.success || !passwordResult.success || (id === 'bbb' && !bbbPasswordResult?.success)) {
        return;
      }

      const emailAddress = emailResult.password;
      const password = passwordResult.password;
      const bbbPassword = bbbPasswordResult?.password;

      if (!emailAddress || !password || (id === 'bbb' && !bbbPassword)) {
        return;
      }

      switch (id) {
        case 'outlook':
          await webview.executeJavaScript(
            `document.querySelector('#userNameInput').value = "${emailAddress}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#passwordInput').value = "${password}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#submitButton').click();`
          );
          
          // Save credentials after successful login
          await window.electron.saveCredentials({
            service: 'bbzcloud',
            account: 'email',
            password: emailAddress
          });
          await window.electron.saveCredentials({
            service: 'bbzcloud',
            account: 'password',
            password: password
          });
          
          await sleep(5000);
          webview.reload();
          break;

        case 'moodle':
          await webview.executeJavaScript(
            `document.querySelector('input[name="username"][id="username"]').value = "${emailAddress.toLowerCase()}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('input[name="password"][id="password"]').value = "${password}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('button[type="submit"][id="loginbtn"]').click();`
          );         
          break;

        case 'bbb':
          await webview.executeJavaScript(
            `document.querySelector('#session_email').value = "${emailAddress}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#session_password').value = "${bbbPassword}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('.signin-button').click();`
          );
          
          // Save credentials after successful login
          await window.electron.saveCredentials({
            service: 'bbzcloud',
            account: 'bbbPassword',
            password: bbbPassword
          });
          break;

        case 'handbook':
          await webview.executeJavaScript(
            `document.querySelector('#userNameInput').value = "${emailAddress}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#passwordInput').value = "${password}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#submitButton').click();`
          );        
          await sleep(5000).then(() => {
            webview.reload();
          });
          break;
      }

      setCredsAreSet(prev => ({ ...prev, [id]: true }));
    } catch (error) {
      console.error(`Error injecting credentials for ${id}:`, error);
    }
  }, [credsAreSet]);

  // Set up SchulCloud notification checking with MutationObserver
  useEffect(() => {
    let observer = null;

    const setupNotificationChecking = (webview) => {
      if (!webview) return;

      const checkNotifications = async () => {
        try {
          const faviconData = await webview.executeJavaScript(`
            document.querySelector('link[rel="icon"][type="image/png"]')?.href;
          `);

          if (!faviconData) return;

          const hasNotification = await checkForNotifications(faviconData);
          window.electron.send('update-badge', hasNotification);
        } catch (error) {
          // Silent fail and try again next interval
        }
      };

      // Clear any existing interval
      if (notificationCheckIntervalRef.current) {
        clearInterval(notificationCheckIntervalRef.current);
      }

      // Only start checking when DOM is ready
      webview.addEventListener('dom-ready', () => {
        // Initial check
        checkNotifications();
        
        // Set up interval with a more reasonable frequency
        notificationCheckIntervalRef.current = setInterval(checkNotifications, 8000);
      });
    };

    // Set up observer to watch for the webview
    observer = new MutationObserver((mutations) => {
      const schulcloudWebview = document.querySelector('#wv-schulcloud');
      if (schulcloudWebview) {
        setupNotificationChecking(schulcloudWebview);
        observer.disconnect();
      }
    });

    // Start observing with a configuration
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Check immediately in case the webview already exists
    const existingWebview = document.querySelector('#wv-schulcloud');
    if (existingWebview) {
      setupNotificationChecking(existingWebview);
      observer.disconnect();
    }

    // Cleanup function
    return () => {
      if (observer) {
        observer.disconnect();
      }
      if (notificationCheckIntervalRef.current) {
        clearInterval(notificationCheckIntervalRef.current);
      }
    };
  }, []); // Empty dependency array means this runs once when component mounts

  useEffect(() => {
    // Track event listeners for cleanup
    const eventCleanups = new Map();

    // Helper to add event listener with cleanup
    const addWebviewListener = (webview, event, handler) => {
      webview.addEventListener(event, handler);
      const cleanups = eventCleanups.get(webview) || [];
      cleanups.push(() => webview.removeEventListener(event, handler));
      eventCleanups.set(webview, cleanups);
    };

    // Set up event listeners for all webviews
    const setupWebviewListeners = (webview) => {
      const id = webview.id.replace('wv-', '').toLowerCase();

      // Loading state handlers
      addWebviewListener(webview, 'did-start-loading', () => {
        setIsLoading(prev => ({ ...prev, [id]: true }));
      });

      addWebviewListener(webview, 'did-stop-loading', () => {
        setIsLoading(prev => ({ ...prev, [id]: false }));
      });

      // Load completion handler
      addWebviewListener(webview, 'dom-ready', async () => {
        if (activeWebView && activeWebView.id === id) {
          onNavigate(webview.getURL());
        }

        // Apply zoom after a short delay to ensure webview is ready
        setTimeout(async () => {
          await applyZoom(webview, id);
        }, 1000);
        
        await injectCredentials(webview, id);

        // Context menu setup (only add once)
        const url = webview.getURL();
        if (
          url.includes('schul.cloud') ||
          url.includes('portal.bbz-rd-eck.com') ||
          url.includes('taskcards.app') ||
          url.includes('wiki.bbz-rd-eck.com')
        ) {
          const contextMenuHandler = async (e) => {
            e.preventDefault();
            try {
              const selectedText = await webview.executeJavaScript(`window.getSelection().toString()`);
              if (selectedText) {
                window.electron.send('showContextMenu', {
                  x: e.x,
                  y: e.y,
                  selectionText: selectedText,
                });
              }
            } catch (error) {
              console.error('Error getting selected text:', error);
            }
          };
          addWebviewListener(webview, 'context-menu', contextMenuHandler);
        }
      });

      // Navigation handler
      addWebviewListener(webview, 'did-navigate', () => {
        if (id === 'handbook') {
          setCredsAreSet(prev => ({ ...prev, [id]: false }));
        }
      });

      // Error handler
      addWebviewListener(webview, 'did-fail-load', (error) => {
        setIsLoading(prev => ({ ...prev, [id]: false }));
        if (!isStartupPeriod && error.errorCode < -3) {
          toast({
            title: 'Fehler beim Laden der Seite',
            description: error.errorDescription || 'Die Seite konnte nicht geladen werden',
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
        }
      });
    };

    // Set up listeners for existing webviews
    const webviews = document.querySelectorAll('webview');
    webviews.forEach(setupWebviewListeners);

    // Cleanup function
    return () => {
      eventCleanups.forEach((cleanups, webview) => {
        cleanups.forEach(cleanup => cleanup());
      });
      eventCleanups.clear();
    };
  }, [activeWebView, applyZoom, injectCredentials, onNavigate, toast, isStartupPeriod]);

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
      {/* Standard apps */}
      {Object.entries(standardApps).map(([id, config]) => {
        if (!config.visible) return null;

        const isActive = activeWebView?.id === id;
        const ref = webviewRefs.current[id] = webviewRefs.current[id] || React.createRef();

        return (
          <Box
            key={id}
            position="absolute"
            top="0"
            left="0"
            right="0"
            bottom="0"
            display={isActive ? 'block' : 'none'}
            visibility={isActive ? 'visible' : 'hidden'}
            zIndex={isActive ? 1 : 0}
          >
            {isLoading[id] && (
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
            <webview
              ref={ref}
              id={`wv-${id}`}
              src={config.url}
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
              }}
              allowpopups="true"
              partition="persist:main"
              webpreferences="nativeWindowOpen=yes"
            />
          </Box>
        );
      })}

      {/* Custom apps webview */}
      {activeWebView && !standardApps[activeWebView.id] && (
        <Box 
          position="absolute"
          top="0"
          left="0"
          right="0"
          bottom="0"
          zIndex={2}
        >
          {isLoading[activeWebView.id] && (
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
          <webview
            ref={webviewRefs.current[activeWebView.id]}
            id={`wv-${activeWebView.id}`}
            src={activeWebView.url}
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
            }}
            allowpopups="true"
            partition="persist:main"
            webpreferences="nativeWindowOpen=yes"
          />
        </Box>
      )}
    </Box>
  );
});

WebViewContainer.displayName = 'WebViewContainer';

export default WebViewContainer;
