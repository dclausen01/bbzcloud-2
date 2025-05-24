import { useEffect, useCallback, useRef } from 'react';
import { APP_CONFIG, ERROR_CODE_MAPPINGS, ERROR_MESSAGES, WEBVIEW_CONFIG } from '../utils/constants';
import { debounce } from '../utils/accessibility';

/**
 * Custom hook for setting up WebView event handlers and management
 * @param {Object} options - Configuration options
 * @returns {Object} - WebView management functions
 */
export const useWebViewSetup = ({
  onLoadingChange,
  onNavigate,
  onError,
  onCredentialInjection,
  activeWebView,
  settings,
  isStartupPeriod = false,
}) => {
  const eventCleanupsRef = useRef(new Map());
  const errorTimeoutsRef = useRef({});

  /**
   * Get error message from error code
   * @param {Object} error - Error object with errorCode
   * @returns {string} - Human-readable error message
   */
  const getErrorMessage = useCallback((error) => {
    return ERROR_CODE_MAPPINGS[error.errorCode.toString()] || ERROR_MESSAGES.GENERIC_LOAD_ERROR;
  }, []);

  /**
   * Apply zoom to a webview
   * @param {HTMLElement} webview - The webview element
   * @param {string} id - The webview ID
   */
  const applyZoom = useCallback(async (webview, id) => {
    if (!webview || !settings?.globalZoom) return;

    try {
      const zoomFactor = settings.globalZoom;
      const webContentsId = await webview.getWebContentsId();
      
      if (webContentsId) {
        await window.electron.setZoomFactor(webContentsId, zoomFactor);
      }
    } catch (error) {
      console.error(`Error setting zoom for ${id}:`, error);
    }
  }, [settings?.globalZoom]);

  /**
   * Handle webview loading state
   * @param {HTMLElement} webview - The webview element
   * @param {string} id - The webview ID
   */
  const setupLoadingHandlers = useCallback((webview, id) => {
    const handleStartLoading = () => {
      onLoadingChange?.(id, true);
    };

    const handleStopLoading = () => {
      onLoadingChange?.(id, false);
    };

    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('did-stop-loading', handleStopLoading);

    // Store cleanup functions
    const cleanups = eventCleanupsRef.current.get(webview) || [];
    cleanups.push(
      () => webview.removeEventListener('did-start-loading', handleStartLoading),
      () => webview.removeEventListener('did-stop-loading', handleStopLoading)
    );
    eventCleanupsRef.current.set(webview, cleanups);
  }, [onLoadingChange]);

  /**
   * Handle webview navigation
   * @param {HTMLElement} webview - The webview element
   * @param {string} id - The webview ID
   */
  const setupNavigationHandlers = useCallback((webview, id) => {
    const handleNavigation = () => {
      if (activeWebView?.id === id) {
        onNavigate?.(webview.getURL());
      }
    };

    webview.addEventListener('did-navigate', handleNavigation);
    webview.addEventListener('did-navigate-in-page', handleNavigation);

    // Store cleanup functions
    const cleanups = eventCleanupsRef.current.get(webview) || [];
    cleanups.push(
      () => webview.removeEventListener('did-navigate', handleNavigation),
      () => webview.removeEventListener('did-navigate-in-page', handleNavigation)
    );
    eventCleanupsRef.current.set(webview, cleanups);
  }, [activeWebView?.id, onNavigate]);

  /**
   * Handle webview errors with retry mechanism
   * @param {HTMLElement} webview - The webview element
   * @param {string} id - The webview ID
   */
  const setupErrorHandlers = useCallback((webview, id) => {
    const handleError = (error) => {
      onLoadingChange?.(id, false);

      if (!isStartupPeriod && error.errorCode < -3) {
        // Clear any existing timeout for this webview
        if (errorTimeoutsRef.current[id]) {
          clearTimeout(errorTimeoutsRef.current[id]);
        }

        // Set a new timeout to check if the error persists
        errorTimeoutsRef.current[id] = setTimeout(async () => {
          try {
            // Try to reload the webview
            webview.reload();

            // Wait to see if it loads successfully
            await new Promise(resolve => setTimeout(resolve, APP_CONFIG.WEBVIEW_RELOAD_DELAY));

            // Check if the webview is now working
            const isWorking = await webview.executeJavaScript('true').catch(() => false);

            if (!isWorking) {
              const errorMessage = getErrorMessage(error);
              onError?.(id, errorMessage, error);
            }
          } catch (retryError) {
            console.error('Error in retry mechanism:', retryError);
          }
        }, APP_CONFIG.ERROR_RETRY_DELAY);
      }
    };

    webview.addEventListener('did-fail-load', handleError);

    // Store cleanup functions
    const cleanups = eventCleanupsRef.current.get(webview) || [];
    cleanups.push(() => {
      webview.removeEventListener('did-fail-load', handleError);
      if (errorTimeoutsRef.current[id]) {
        clearTimeout(errorTimeoutsRef.current[id]);
        delete errorTimeoutsRef.current[id];
      }
    });
    eventCleanupsRef.current.set(webview, cleanups);
  }, [isStartupPeriod, onLoadingChange, onError, getErrorMessage]);

  /**
   * Handle DOM ready event
   * @param {HTMLElement} webview - The webview element
   * @param {string} id - The webview ID
   */
  const setupDOMReadyHandlers = useCallback((webview, id) => {
    const handleDOMReady = async () => {
      // Apply zoom after a short delay
      setTimeout(() => applyZoom(webview, id), APP_CONFIG.CREDENTIAL_INJECTION_DELAY);

      // Handle credential injection
      onCredentialInjection?.(webview, id);

      // Handle CryptPad popup override
      if (webview.getURL().includes('cryptpad')) {
        await webview.executeJavaScript(`
          // Override popup detection
          window.open = new Proxy(window.open, {
            apply: function(target, thisArg, args) {
              const result = Reflect.apply(target, thisArg, args);
              if (!result) {
                return { closed: false };
              }
              return result;
            }
          });
          // Clear any existing popup warning messages
          const popupWarning = document.querySelector('.cp-popup-warning');
          if (popupWarning) {
            popupWarning.remove();
          }
        `);
      }
    };

    webview.addEventListener('dom-ready', handleDOMReady);

    // Store cleanup functions
    const cleanups = eventCleanupsRef.current.get(webview) || [];
    cleanups.push(() => webview.removeEventListener('dom-ready', handleDOMReady));
    eventCleanupsRef.current.set(webview, cleanups);
  }, [applyZoom, onCredentialInjection]);

  /**
   * Setup context menu for specific webviews
   * @param {HTMLElement} webview - The webview element
   * @param {string} id - The webview ID
   */
  const setupContextMenu = useCallback((webview, id) => {
    const contextMenuUrls = [
      'schul.cloud',
      'portal.bbz-rd-eck.com',
      'taskcards.app',
      'wiki.bbz-rd-eck.com'
    ];

    const shouldHaveContextMenu = contextMenuUrls.some(url => 
      webview.getURL().includes(url)
    );

    if (shouldHaveContextMenu) {
      const handleContextMenu = async (e) => {
        e.preventDefault();
        try {
          const selectedText = await webview.executeJavaScript('window.getSelection().toString()');
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

      webview.addEventListener('context-menu', handleContextMenu);

      // Store cleanup functions
      const cleanups = eventCleanupsRef.current.get(webview) || [];
      cleanups.push(() => webview.removeEventListener('context-menu', handleContextMenu));
      eventCleanupsRef.current.set(webview, cleanups);
    }
  }, []);

  /**
   * Setup all event handlers for a webview
   * @param {HTMLElement} webview - The webview element
   */
  const setupWebView = useCallback((webview) => {
    if (!webview) return;

    const id = webview.id.replace('wv-', '').toLowerCase();

    // Setup all handlers
    setupLoadingHandlers(webview, id);
    setupNavigationHandlers(webview, id);
    setupErrorHandlers(webview, id);
    setupDOMReadyHandlers(webview, id);
    setupContextMenu(webview, id);

    return () => {
      // Cleanup all event listeners for this webview
      const cleanups = eventCleanupsRef.current.get(webview);
      if (cleanups) {
        cleanups.forEach(cleanup => cleanup());
        eventCleanupsRef.current.delete(webview);
      }
    };
  }, [
    setupLoadingHandlers,
    setupNavigationHandlers,
    setupErrorHandlers,
    setupDOMReadyHandlers,
    setupContextMenu
  ]);

  /**
   * Create webview element with proper configuration
   * @param {Object} config - Webview configuration
   * @returns {Object} - Webview props for React
   */
  const createWebViewProps = useCallback((config) => {
    return {
      src: config.url,
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
      },
      allowpopups: WEBVIEW_CONFIG.ALLOW_POPUPS,
      partition: WEBVIEW_CONFIG.PARTITION,
      webpreferences: WEBVIEW_CONFIG.WEB_PREFERENCES,
      useragent: WEBVIEW_CONFIG.USER_AGENT,
    };
  }, []);

  /**
   * Handle system resume events
   * @param {Array} webviewsToReload - Array of webview IDs to reload
   * @param {Object} webviewRefs - Ref object containing webview references
   */
  const handleSystemResume = useCallback((webviewsToReload, webviewRefs) => {
    webviewsToReload.forEach(id => {
      const webview = webviewRefs.current[id]?.current;
      if (webview) {
        if (id === 'outlook') {
          // For Outlook, clear credentials state and force complete reload
          webview.clearHistory();
          webview.loadURL('https://exchange.bbz-rd-eck.de/owa/');
        } else if (id === 'webuntis') {
          // For WebUntis, check if we're on the authenticator page before reloading
          webview.executeJavaScript(`
            const authLabel = document.querySelector('.un-input-group__label');
            authLabel?.textContent === 'Bestätigungscode';
          `).then(isAuthPage => {
            if (!isAuthPage) {
              webview.reload();
            }
          });
        } else {
          webview.reload();
        }
      }
    });
  }, []);

  /**
   * Cleanup all event listeners
   */
  const cleanup = useCallback(() => {
    eventCleanupsRef.current.forEach((cleanups) => {
      cleanups.forEach(cleanup => cleanup());
    });
    eventCleanupsRef.current.clear();

    // Clear all error timeouts
    Object.values(errorTimeoutsRef.current).forEach(timeout => clearTimeout(timeout));
    errorTimeoutsRef.current = {};
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    setupWebView,
    createWebViewProps,
    applyZoom,
    handleSystemResume,
    cleanup,
  };
};

/**
 * Hook for managing webview notification checking (SchulCloud)
 * @param {Function} onNotificationChange - Callback when notification state changes
 * @returns {Object} - Notification management functions
 */
export const useWebViewNotifications = (onNotificationChange) => {
  const notificationCheckIntervalRef = useRef(null);

  /**
   * Check for notifications in favicon
   * @param {string} base64Image - Base64 encoded favicon
   * @returns {Promise<boolean>} - Whether notifications are present
   */
  const checkForNotifications = useCallback((base64Image) => {
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
          Math.floor(img.width * 0.5),
          Math.floor(img.height * 0.5),
          Math.floor(img.width * 0.5),
          Math.floor(img.height * 0.5)
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
          if (alpha > 200) {
            totalPixels++;
            // Check if pixel is in the red range
            if (red > 200 && green > 80 && green < 190 && blue > 100 && blue < 190) {
              redPixelCount++;
            }
          }
        }
        
        // Calculate percentage of matching pixels
        const redPercentage = totalPixels > 0 ? redPixelCount / totalPixels : 0;
        resolve(redPercentage > 0.4); // 40% threshold
      };
      
      img.onerror = function (error) {
        reject(new Error('Failed to load favicon'));
      };
      
      img.src = base64Image;
    });
  }, []);

  /**
   * Setup notification checking for SchulCloud
   * @param {HTMLElement} webview - The SchulCloud webview element
   */
  const setupNotificationChecking = useCallback((webview) => {
    if (!webview) return;

    const checkNotifications = debounce(async () => {
      try {
        const faviconData = await webview.executeJavaScript(`
          document.querySelector('link[rel="icon"][type="image/png"]')?.href;
        `);

        if (!faviconData) return;

        const hasNotification = await checkForNotifications(faviconData);
        onNotificationChange?.(hasNotification);
      } catch (error) {
        // Silent fail and try again next interval
      }
    }, 1000);

    // Clear any existing interval
    if (notificationCheckIntervalRef.current) {
      clearInterval(notificationCheckIntervalRef.current);
    }

    // Only start checking when DOM is ready
    webview.addEventListener('dom-ready', () => {
      // Initial check
      checkNotifications();
      
      // Set up interval
      notificationCheckIntervalRef.current = setInterval(
        checkNotifications, 
        APP_CONFIG.NOTIFICATION_CHECK_INTERVAL
      );
    });

    // Return cleanup function
    return () => {
      if (notificationCheckIntervalRef.current) {
        clearInterval(notificationCheckIntervalRef.current);
        notificationCheckIntervalRef.current = null;
      }
    };
  }, [checkForNotifications, onNotificationChange]);

  return {
    setupNotificationChecking,
    checkForNotifications,
  };
};

export default useWebViewSetup;
