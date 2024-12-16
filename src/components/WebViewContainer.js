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

const WebViewContainer = forwardRef(({ activeWebView, onNavigate, standardApps }, ref) => {
  const webviewRefs = useRef({});
  const [isLoading, setIsLoading] = useState({});
  const [overviewImagePath, setOverviewImagePath] = useState('');
  const [imageError, setImageError] = useState(false);
  const [credsAreSet, setCredsAreSet] = useState({});
  const toast = useToast();
  const { colorMode } = useColorMode();

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
  const isRedDominant = (base64Image, threshold = 0.5) => {
    const img = new Image();
    img.src = base64Image;
    return new Promise((resolve, reject) => {
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
        // Check each pixel for exact badge color
        for (let i = 0; i < imageData.length; i += 4) {
          if (
            imageData[i] === 234 &&     // Red
            imageData[i + 1] === 109 && // Green
            imageData[i + 2] === 132    // Blue
          ) {
            redPixelCount++;
          }
        }
        
        // Calculate percentage of matching pixels
        const redPercentage = redPixelCount / (imageData.length / 4);
        const isDominant = redPercentage > threshold;
        resolve(isDominant);
      };
      img.onerror = function () {
        reject('Error loading favicon');
      };
    });
  };

  // Function to inject credentials based on webview ID
  const injectCredentials = async (webview, id) => {
    if (!webview || credsAreSet[id]) return;

    try {
      const settings = await window.electron.getSettings();
      if (!settings.success || !settings.settings) return;

      const creds = settings.settings;

      switch (id) {
        case 'outlook':
          await webview.executeJavaScript(
            `document.querySelector('#userNameInput').value = "${creds.emailAddress}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#passwordInput').value = "${creds.outlookPassword}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#submitButton').click();`
          );
          await sleep(5000);
          webview.reload();
          break;

        case 'moodle':
          await webview.executeJavaScript(
            `document.querySelector('#username').value = "${creds.emailAddress.toLowerCase()}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#password').value = "${creds.outlookPassword}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#loginbtn').click();`
          );
          break;

        case 'bbb':
          await webview.executeJavaScript(
            `document.querySelector('#session_email').value = "${creds.emailAddress}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#session_password').value = "${creds.bbbPassword}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.getElementsByClassName('signin-button')[0].click();`
          );
          break;

        case 'bbzhandbuch':
          await webview.executeJavaScript(
            `document.querySelector('#userNameInput').value = "${creds.emailAddress}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#passwordInput').value = "${creds.outlookPassword}"; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#submitButton').click();`
          );
          await sleep(5000);
          webview.reload();
          break;
      }

      setCredsAreSet(prev => ({ ...prev, [id]: true }));
    } catch (error) {
      console.error(`Error injecting credentials for ${id}:`, error);
    }
  };

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

        // Inject credentials if needed
        await injectCredentials(webview, id);

        // Set up context menu for specific webviews
        if (['schulcloud', 'moodle', 'bigbluebutton', 'bbzhandbuch', 'bbzwiki', 'webuntis'].includes(id)) {
          webview.addEventListener('context-menu', (e) => {
            e.preventDefault();
            window.electron.send('contextMenu', {
              x: e.x,
              y: e.y,
              selectionText: e.selectionText,
            });
          });
        }

        // Check SchulCloud notifications
        if (id === 'schulcloud') {
          const checkNotifications = async () => {
            try {
              const favicon = await webview.executeJavaScript(
                `document.getElementsByTagName("link")[0].href;`
              );
              const hasNotification = await isRedDominant(favicon);
              window.electron.send('update-badge', hasNotification);
            } catch (error) {
              console.error('Error checking SchulCloud notifications:', error);
            }
          };

          checkNotifications();
          const interval = setInterval(checkNotifications, 8000);
          return () => clearInterval(interval);
        }
      });

      // Handle BBB redirects
      webview.addEventListener('will-navigate', (e) => {
        const url = e.url;
        if (url.includes('bbb.bbz-rd-eck.de/bigbluebutton/api/join?')) {
          e.preventDefault();
          window.electron.send('open-external', url);
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
              preload="webview-preload.js"
              partition={`persist:${id}`}
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
            preload="webview-preload.js"
            partition="persist:custom"
          />
        </Box>
      )}
    </Box>
  );
});

WebViewContainer.displayName = 'WebViewContainer';

export default WebViewContainer;
