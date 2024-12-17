/* eslint-disable default-case */
import React, { useRef, useEffect, useState, forwardRef } from 'react';
import {
  Box,
  Flex,
  Progress,
  useToast,
  useColorMode,
  Image,
  Text,
} from '@chakra-ui/react';
import { useSettings } from '../context/SettingsContext';

const WebViewContainer = forwardRef(({ activeWebView, onNavigate, standardApps }, ref) => {
  const webviewRefs = useRef({});
  const [isLoading, setIsLoading] = useState({});
  const [overviewImagePath, setOverviewImagePath] = useState('');
  const [imageError, setImageError] = useState(false);
  const [credsAreSet, setCredsAreSet] = useState({});
  const toast = useToast();
  const { colorMode, setColorMode } = useColorMode();
  const { settings } = useSettings();

  // Apply zoom level to a webview
  const applyZoom = async (webview, id) => {
    if (!webview) return;
    
    try {
      const zoomLevel = standardApps[id]?.zoom || settings.globalZoom;
      await webview.setZoomLevel(Math.log2(zoomLevel)); // Convert zoom factor to zoom level
    } catch (error) {
      console.error(`Error setting zoom for ${id}:`, error);
    }
  };

  // Update zoom levels when settings change
  useEffect(() => {
    Object.entries(webviewRefs.current).forEach(([id, ref]) => {
      if (ref.current) {
        applyZoom(ref.current, id);
      }
    });
  }, [settings.globalZoom, standardApps]);

  // Listen for theme changes from main process
  useEffect(() => {
    const unsubscribe = window.electron.onThemeChanged((theme) => {
      setColorMode(theme);
    });
    return () => unsubscribe();
  }, [setColorMode]);

  useEffect(() => {
    const loadOverviewImage = async () => {
      try {
        const imagePath = await window.electron.resolveAssetPath('uebersicht.png');
        setOverviewImagePath(imagePath);
        setImageError(false);
      } catch (error) {
        console.error('Fehler beim Laden des Übersichtsbildes:', error);
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

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper function to check if favicon indicates new messages
  const checkForNotifications = (base64Image) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, img.width, img.height);
        
        // Get lower right quadrant
        const imageData = ctx.getImageData(
          img.width / 2,
          img.height / 2,
          img.width / 2,
          img.height / 2
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
          if (alpha > 0) {
            totalPixels++;
            // Check if pixel matches the exact notification color (234, 109, 132)
            if (red === 234 && green === 109 && blue === 132) {
              redPixelCount++;
            }
          }
        }
        
        // Calculate percentage of matching pixels
        const redPercentage = totalPixels > 0 ? redPixelCount / totalPixels : 0;
        resolve(redPercentage > 0.5); // If more than 50% of pixels match
      };
      
      img.onerror = function () {
        reject(new Error('Failed to load favicon'));
      };
      
      img.src = base64Image;
    });
  };

  // Function to inject credentials based on webview ID
  const injectCredentials = async (webview, id) => {
    if (!webview || credsAreSet[id]) return;

    try {
      console.log(`Retrieving credentials for ${id}...`);
      
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

      console.log('Credentials retrieved:', {
        emailSuccess: emailResult.success,
        passwordSuccess: passwordResult.success,
        bbbSuccess: bbbPasswordResult?.success
      });

      if (!emailResult.success || !passwordResult.success || (id === 'bbb' && !bbbPasswordResult?.success)) {
        console.error('Failed to retrieve credentials');
        return;
      }

      const emailAddress = emailResult.password;
      const password = passwordResult.password;
      const bbbPassword = bbbPasswordResult?.password;

      if (!emailAddress || !password || (id === 'bbb' && !bbbPassword)) {
        console.error('One or more credentials are missing');
        return;
      }

      console.log(`Injecting credentials for ${id}...`);

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
          break;

        case 'handbook':
          // Don't reload immediately, wait for the page to load first
          await sleep(1000); // Wait for initial page load
          await webview.executeJavaScript(
            `document.querySelector('#userNameInput').value = "${emailAddress}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#passwordInput').value = "${password}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#submitButton').click();`
          );
          await sleep(3000);
          webview.reload();
          break;
      }

      console.log(`Credentials injected for ${id}`);
      setCredsAreSet(prev => ({ ...prev, [id]: true }));
    } catch (error) {
      console.error(`Error injecting credentials for ${id}:`, error);
    }
  };

  // Set up SchulCloud notification checking
  useEffect(() => {
    const schulcloudWebview = document.querySelector('#wv-schulcloud');
    if (!schulcloudWebview) return;

    const checkNotifications = async () => {
      try {
        // Get the favicon directly from the link tag with exact selector
        const faviconData = await schulcloudWebview.executeJavaScript(`
          (function() {
            const link = document.querySelector('link[rel="icon"]');
            if (!link) {
              console.log('No icon link found');
              return null;
            }
            console.log('Found favicon with href:', link.href);
            return link.href;
          })();
        `);

        if (!faviconData) {
          console.log('No favicon data returned');
          return;
        }

        // Log the first 100 characters of the favicon data to verify it's correct
        console.log('Favicon data (first 100 chars):', faviconData.substring(0, 100));
        
        // Check for notifications in the renderer process
        const hasNotification = await checkForNotifications(faviconData);
        console.log('SchulCloud notification check result:', hasNotification, 'at:', new Date().toISOString());
        
        // Send the result to the main process to update icons
        window.electron.send('update-badge', hasNotification);
      } catch (error) {
        console.error('Error checking SchulCloud notifications:', error);
      }
    };

    console.log('Setting up SchulCloud notification checking');
    
    // Initial check
    checkNotifications();
    
    // Set up interval for periodic checks
    const interval = setInterval(checkNotifications, 3000); // Check every 3 seconds
    
    // Cleanup interval when component unmounts
    return () => {
      console.log('Cleaning up SchulCloud notification checking');
      clearInterval(interval);
    };
  }, []); // Empty dependency array means this runs once when component mounts

  useEffect(() => {
    // Set up event listeners for all webviews
    document.querySelectorAll('webview').forEach((webview) => {
      const id = webview.id.replace('wv-', '').toLowerCase();

      webview.addEventListener('did-start-loading', () => {
        console.log(`[DEBUG] Load started for ${id}`);
        setIsLoading(prev => ({ ...prev, [id]: true }));
      });

      webview.addEventListener('did-stop-loading', () => {
        console.log(`[DEBUG] Load stopped for ${id}`);
        setIsLoading(prev => ({ ...prev, [id]: false }));
      });

      webview.addEventListener('did-finish-load', async () => {
        console.log(`[DEBUG] Load finished for ${id}`);
        
        if (activeWebView && activeWebView.id === id) {
          onNavigate(webview.getURL());
        }

        // Apply zoom level
        await applyZoom(webview, id);

        // Inject credentials if needed
        await injectCredentials(webview, id);

        // Check if this webview should have context menu
        const url = webview.getURL();
        if (
          url.includes('schul.cloud') ||
          url.includes('portal.bbz-rd-eck.com') || // Moodle
          url.includes('taskcards.app') ||
          url.includes('wiki.bbz-rd-eck.com')
        ) {
          webview.addEventListener('context-menu', (e) => {
            e.preventDefault();
            window.electron.send('contextMenu', {
              x: e.x,
              y: e.y,
              selectionText: e.selectionText,
            });
          });
        }
      });

      // Add navigation event listener
      webview.addEventListener('will-navigate', (e) => {
        console.log(`[DEBUG] Navigation for ${id} to: ${e.url}`);
      });

      webview.addEventListener('did-navigate', (e) => {
        console.log(`[DEBUG] Navigated ${id} to: ${e.url}`);
        // Reset credentials flag on navigation to allow re-injection if needed
        if (id === 'handbook') {
          setCredsAreSet(prev => ({ ...prev, [id]: false }));
        }
      });

      webview.addEventListener('did-fail-load', (error) => {
        console.error(`[DEBUG] Load error for ${id}:`, error);
        setIsLoading(prev => ({ ...prev, [id]: false }));
        toast({
          title: 'Fehler beim Laden der Seite',
          description: error.errorDescription || 'Die Seite konnte nicht geladen werden',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      });

      // Add console message listener for debugging
      webview.addEventListener('console-message', (e) => {
        console.log(`[WebView ${id}] ${e.message}`);
      });
    });
  }, []);

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
            <Image
              src={overviewImagePath}
              alt="Übersicht"
              maxH="90%"
              maxW="90%"
              objectFit="contain"
              borderRadius="md"
              boxShadow="lg"
              onError={(e) => {
                console.error('Fehler beim Laden des Bildes:', e);
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
              webpreferences="allowRunningInsecureContent"
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
            webpreferences="allowRunningInsecureContent"
          />
        </Box>
      )}
    </Box>
  );
});

WebViewContainer.displayName = 'WebViewContainer';

export default WebViewContainer;
