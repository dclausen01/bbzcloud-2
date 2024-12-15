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

const injectCredentials = async (webview, id, credentials) => {
  if (!webview || !credentials || credsAreSet[id]) {
    console.log(`[DEBUG] Injection skipped for ${id}:`, {
      hasWebview: !!webview,
      hasCredentials: !!credentials,
      alreadySet: credsAreSet[id]
    });
    return;
  }

  console.log(`[DEBUG] Attempting to inject credentials for ${id}`);
  try {
    // Get webview's internal ID
    const webviewId = webview.getWebContentsId();
      console.log(`[DEBUG] WebView ID for ${id}:`, webviewId);

      switch (id.toLowerCase()) {
        case 'outlook':
          console.log('[DEBUG] Injecting Outlook credentials');
          await window.electron.executeJavaScript({
            webviewId,
            code: `document.querySelector('#userNameInput').value = "${credentials.email}";`
          });
          await window.electron.executeJavaScript({
            webviewId,
            code: `document.querySelector('#passwordInput').value = "${credentials.password}";`
          });
          await window.electron.executeJavaScript({
            webviewId,
            code: `document.querySelector('#submitButton').click();`
          });
          await sleep(5000);
          webview.reload();
          setCredsAreSet(prev => ({ ...prev, outlook: true }));
          break;

        case 'moodle':
          console.log('[DEBUG] Injecting Moodle credentials');
          await window.electron.executeJavaScript({
            webviewId,
            code: `document.querySelector('#username').value = "${credentials.email.toLowerCase()}";`
          });
          await window.electron.executeJavaScript({
            webviewId,
            code: `document.querySelector('#password').value = "${credentials.password}";`
          });
          await window.electron.executeJavaScript({
            webviewId,
            code: `document.querySelector('#loginbtn').click();`
          });
          setCredsAreSet(prev => ({ ...prev, moodle: true }));
          break;

        case 'bbb':
        case 'bigbluebutton':
          console.log('[DEBUG] Injecting BBB credentials');
          await window.electron.executeJavaScript({
            webviewId,
            code: `document.querySelector('#session_email').value = "${credentials.email}";`
          });
          await window.electron.executeJavaScript({
            webviewId,
            code: `document.querySelector('#session_password').value = "${credentials.bbbPassword}";`
          });
          await window.electron.executeJavaScript({
            webviewId,
            code: `document.getElementsByClassName('signin-button')[0].click();`
          });
          setCredsAreSet(prev => ({ ...prev, bbb: true }));
          break;

        case 'handbuch':
        case 'bbzhandbuch':
          console.log('[DEBUG] Injecting Handbuch credentials');
          await window.electron.executeJavaScript({
            webviewId,
            code: `document.querySelector('#userNameInput').value = "${credentials.email}";`
          });
          await window.electron.executeJavaScript({
            webviewId,
            code: `document.querySelector('#passwordInput').value = "${credentials.password}";`
          });
          await window.electron.executeJavaScript({
            webviewId,
            code: `document.querySelector('#submitButton').click();`
          });
          await sleep(5000);
          webview.reload();
          setCredsAreSet(prev => ({ ...prev, handbuch: true }));
          break;

        default:
          console.log(`[DEBUG] No credential injection needed for ${id}`);
          break;
      }
    } catch (error) {
      console.error(`[DEBUG] Error injecting credentials for ${id}:`, error);
      toast({
        title: 'Anmeldedaten-Injektion fehlgeschlagen',
        description: `Fehler beim Einsetzen der Anmeldedaten für ${id}`,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const setupWebviewListeners = async (webview, id) => {
    if (!webview) {
      console.log(`[DEBUG] setupWebviewListeners: No webview for ${id}`);
      return;
    }

    console.log(`[DEBUG] Setting up listeners for ${id}`);
    console.log(`[DEBUG] Initial WebContents ID for ${id}:`, webview.getWebContentsId());

    const handleLoadStart = () => {
      console.log(`[DEBUG] Load started for ${id}`);
      console.log(`[DEBUG] WebContents ID at load start for ${id}:`, webview.getWebContentsId());
      setIsLoading(prev => ({ ...prev, [id]: true }));
    };

    const handleLoadStop = () => {
      console.log(`[DEBUG] Load stopped for ${id}`);
      console.log(`[DEBUG] WebContents ID at load stop for ${id}:`, webview.getWebContentsId());
      setIsLoading(prev => ({ ...prev, [id]: false }));
    };

    const handleFinishLoad = async () => {
      console.log(`[DEBUG] Load finished for ${id}`);
      console.log(`[DEBUG] WebContents ID at load finish for ${id}:`, webview.getWebContentsId());
      
      if (activeWebView && activeWebView.id === id) {
        onNavigate(webview.getURL());
      }

      // Get credentials and inject them
      try {
        console.log(`[DEBUG] Fetching credentials for ${id}`);
        const emailResult = await window.electron.getCredentials({ 
          service: 'bbzcloud', 
          account: 'email' 
        });
        const passwordResult = await window.electron.getCredentials({ 
          service: 'bbzcloud', 
          account: 'password' 
        });
        const bbbPasswordResult = await window.electron.getCredentials({ 
          service: 'bbzcloud', 
          account: 'bbbPassword' 
        });
        
        console.log(`[DEBUG] Credential fetch results for ${id}:`, {
          emailSuccess: emailResult.success,
          passwordSuccess: passwordResult.success,
          bbbPasswordSuccess: bbbPasswordResult.success
        });

        if (emailResult.success && passwordResult.success) {
          const credentials = {
            email: emailResult.password,
            password: passwordResult.password,
            bbbPassword: bbbPasswordResult.success ? bbbPasswordResult.password : ''
          };
          
          // Wait for DOM to be fully ready
          await sleep(5000); // Increased delay to ensure DOM is ready
          console.log(`[DEBUG] WebContents ID before injection for ${id}:`, webview.getWebContentsId());
          await injectCredentials(webview, id, credentials);
    }
      } catch (error) {
        console.error('[DEBUG] Error getting credentials:', error);
      }
    };

    const handleError = (error) => {
      console.error(`[DEBUG] Load error for ${id}:`, error);
      setIsLoading(prev => ({ ...prev, [id]: false }));
      toast({
        title: 'Fehler beim Laden der Seite',
        description: error.errorDescription || 'Die Seite konnte nicht geladen werden',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    };

    // Remove existing listeners first to prevent duplicates
    webview.removeEventListener('did-start-loading', handleLoadStart);
    webview.removeEventListener('did-stop-loading', handleLoadStop);
    webview.removeEventListener('did-finish-load', handleFinishLoad);
    webview.removeEventListener('did-fail-load', handleError);

    // Add event listeners
    webview.addEventListener('did-start-loading', handleLoadStart);
    webview.addEventListener('did-stop-loading', handleLoadStop);
    webview.addEventListener('did-finish-load', handleFinishLoad);
    webview.addEventListener('did-fail-load', handleError);

    // Add context menu for specific webviews
    if (['SchulCloud', 'Moodle', 'BigBlueButton', 'BBZHandbuch', 'BBZWiki', 'WebUntis'].includes(id)) {
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
    if (id.toLowerCase() === 'schulcloud') {
      const checkNotifications = () => {
        const webviewId = webview.getWebContentsId();
        console.log(`[DEBUG] WebContents ID for SchulCloud notifications:`, webviewId);
        
        if (!webviewId) {
          console.log('[DEBUG] No WebContents ID available for SchulCloud notifications');
          return;
        }

        window.electron.executeJavaScript({
          webviewId,
          code: `document.getElementsByTagName("link")[0].href;`
        }).then((favicon) => {
          isRedDominant(favicon)
            .then((result) => {
              window.electron.send('update-badge', result);
            })
            .catch((error) => {
              console.error('Error checking SchulCloud notifications:', error);
            });
        });
      };

      // Initial check
      checkNotifications();

      // Set up periodic check
      const notificationCheckInterval = setInterval(checkNotifications, 8000);

      // Clean up interval and event listeners
      return () => {
        clearInterval(notificationCheckInterval);
        webview.removeEventListener('did-start-loading', handleLoadStart);
        webview.removeEventListener('did-stop-loading', handleLoadStop);
        webview.removeEventListener('did-finish-load', handleFinishLoad);
        webview.removeEventListener('did-fail-load', handleError);
      };
    }

    // Clean up event listeners
    return () => {
      webview.removeEventListener('did-start-loading', handleLoadStart);
      webview.removeEventListener('did-stop-loading', handleLoadStop);
      webview.removeEventListener('did-finish-load', handleFinishLoad);
      webview.removeEventListener('did-fail-load', handleError);
    };
  };

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
              src={config.url}
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
              }}
              allowpopups="true"
              preload="webview-preload.js"
              onLoadCommit={() => {
                console.log(`[DEBUG] LoadCommit triggered for ${id}`);
                setupWebviewListeners(ref.current, id);
              }}
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
            src={activeWebView.url}
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
            }}
            allowpopups="true"
            preload="webview-preload.js"
            onLoadCommit={() => {
              console.log(`[DEBUG] LoadCommit triggered for custom app ${activeWebView.id}`);
              setupWebviewListeners(webviewRefs.current[activeWebView.id]?.current, activeWebView.id);
            }}
            partition="persist:custom"
          />
        </Box>
      )}
    </Box>
  );
});

WebViewContainer.displayName = 'WebViewContainer';

export default WebViewContainer;
