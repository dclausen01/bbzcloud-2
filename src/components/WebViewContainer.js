/* eslint-disable default-case */
import React, { useRef, useEffect, useState, forwardRef, useCallback } from 'react';
import {
  Box,
  Flex,
  Progress,
  Spinner,
  VStack,
  useToast,
  useColorMode,
  Image as ChakraImage,
  Text,
  Button,
} from '@chakra-ui/react';
import { useSettings } from '../context/SettingsContext';
import { useViewBoundsBinding } from '../hooks/useWebContentsView';

// Apps migrated to WebContentsView. Add more IDs here as migration progresses.
//
// Phase 0:  moodle (simple form-fill login)
// Phase 2a: wiki, fobizz, taskcards (no auto-login), bbb (simple form-fill)
// Phase 2b: cryptpad (popup override only), schulportal (periodic form check),
//           nextcloud (multi-step ADFS/SAML), office (multi-step MS login)
// Phase 2c: outlook (ADFS + clearHistory), schulcloud/BBZ Chat (multi-step +
//           encryption password), webuntis (React-fiber valueTracker injection)
const WCV_APPS = new Set([
  'moodle', 'wiki', 'fobizz', 'taskcards', 'bbb',
  'cryptpad', 'schulportal', 'nextcloud', 'office',
  'outlook', 'schulcloud', 'webuntis',
]);

const WebViewContainer = forwardRef(({ activeWebView, onNavigate, standardApps }, ref) => {
  // Expose navigation methods through ref
  React.useImperativeHandle(ref, () => ({
    goBack: () => {
      if (!activeWebView) return;
      const id = activeWebView.id;
      if (WCV_APPS.has(id)) {
        window.electron.view.goBack(id);
        return;
      }
      const webview = webviewRefs.current[id]?.current ||
        document.querySelector(`#wv-${id}`);
      if (webview && webview.src && webview.getWebContentsId) {
        try {
          if (typeof webview.canGoBack === 'function' && webview.canGoBack()) webview.goBack();
        } catch (error) {
          console.warn('Error navigating back:', error);
        }
      }
    },
    goForward: () => {
      if (!activeWebView) return;
      const id = activeWebView.id;
      if (WCV_APPS.has(id)) {
        window.electron.view.goForward(id);
        return;
      }
      const webview = webviewRefs.current[id]?.current ||
        document.querySelector(`#wv-${id}`);
      if (webview && webview.src && webview.getWebContentsId) {
        try {
          if (typeof webview.canGoForward === 'function' && webview.canGoForward()) webview.goForward();
        } catch (error) {
          console.warn('Error navigating forward:', error);
        }
      }
    },
    reload: () => {
      if (!activeWebView) return;
      const id = activeWebView.id;
      if (WCV_APPS.has(id)) {
        window.electron.view.reload(id);
        return;
      }
      const webview = webviewRefs.current[id]?.current ||
        document.querySelector(`#wv-${id}`);
      if (webview && webview.src) {
        try {
          if (typeof webview.reload === 'function') webview.reload();
        } catch (error) {
          console.warn('Error reloading webview:', error);
        }
      }
    },
    print: () => {
      if (!activeWebView) return;
      const id = activeWebView.id;
      if (WCV_APPS.has(id)) {
        window.electron.view.print(id);
        return;
      }
      const webview = webviewRefs.current[id]?.current ||
        document.querySelector(`#wv-${id}`);
      if (webview && webview.src && webview.getWebContentsId) {
        try {
          if (typeof webview.print === 'function') webview.print();
        } catch (error) {
          console.warn('Error printing webview:', error);
        }
      }
    }
  }));
  const webviewRefs = useRef({});
  // anchor refs for WCV apps — the <div> whose bounds we report to the main process
  const wcvAnchorRefs = useRef({});
  // last known URL per WCV app (updated via view:event)
  const wcvUrlsRef = useRef({});
  // periodic login-check intervals for WCV apps that need them
  const wcvIntervalsRef = useRef({});
  const [isLoading, setIsLoading] = useState({});
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [overviewImagePath, setOverviewImagePath] = useState('');
  const [imageError, setImageError] = useState(false);
  // BBZ Chat (chat.bbz-rd-eck.com) auto-login state — drives a large overlay
  // that masks the login form while credentials are being injected, so the
  // user sees a single smooth loading state instead of a brief login screen.
  const [bbzChatLoginActive, setBbzChatLoginActive] = useState(false);
  const [hasBbzChatCredentials, setHasBbzChatCredentials] = useState(false);
  // Use a ref (not state) so reads inside useCallback closures always see the latest value
  // immediately — React state batching would cause stale reads otherwise.
  const credsAreSet = useRef({});
  const [isStartupPeriod, setIsStartupPeriod] = useState(true);
  const loginAttempts = useRef({}); // Track login attempts per app (max 3 per session)
  const failedLogins = useRef({}); // Track fatal login failures (e.g. invalid credentials)
  const MAX_LOGIN_ATTEMPTS = 3;

  // Translate error codes to user-friendly German messages
  const getErrorMessage = (error) => {
    switch (error.errorCode) {
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

  // Retry loading a specific webview
  const handleRetryWebview = (id) => {
    const webview = webviewRefs.current[id]?.current;
    if (webview) {
      webview.reload();
    }
  };
  const toast = useToast();
  const { colorMode, setColorMode } = useColorMode();
  const { settings, isLoading: isSettingsLoading } = useSettings();
  const notificationCheckIntervalRef = useRef(null);

  // Apply zoom level to a webview or WCV
  const applyZoom = useCallback(async (webview, id) => {
    try {
      const zoomFactor = settings.globalZoom;
      if (WCV_APPS.has(id)) {
        await window.electron.view.setZoomFactor(id, zoomFactor);
        return;
      }
      if (!webview) return;
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
  }, [settings.globalZoom, applyZoom, isSettingsLoading, standardApps]);

  // Listen for theme changes from main process
  useEffect(() => {
    if (!window.electron || !window.electron.onThemeChanged) {
      return;
    }
    
    try {
      const unsubscribe = window.electron.onThemeChanged((theme) => {
        setColorMode(theme);
      });
      return () => unsubscribe();
    } catch (error) {
      console.warn('Error setting up theme change listener:', error);
    }
  }, [setColorMode]);

  // Check whether all credentials needed for BBZ Chat auto-login are stored.
  // Re-check periodically so that saving credentials in Settings takes effect
  // without an app restart.
  useEffect(() => {
    if (!window.electron || !window.electron.getCredentials) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const [emailResult, passwordResult, encResult] = await Promise.all([
          window.electron.getCredentials({ service: 'bbzcloud', account: 'email' }),
          window.electron.getCredentials({ service: 'bbzcloud', account: 'password' }),
          window.electron.getCredentials({ service: 'bbzcloud', account: 'schulcloudEncryptionPassword' }),
        ]);
        const ok = !!(
          emailResult?.success && emailResult.password?.trim() &&
          passwordResult?.success && passwordResult.password?.trim() &&
          encResult?.success && encResult.password?.trim()
        );
        if (!cancelled) setHasBbzChatCredentials(ok);
      } catch (error) {
        if (!cancelled) setHasBbzChatCredentials(false);
      }
    };

    refresh();
    const interval = setInterval(refresh, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Listen for download progress
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

  // -------------------------------------------------------------------------
  // WebContentsView lifecycle
  // -------------------------------------------------------------------------

  // Create WCV apps on mount (mirroring the webview preload logic).
  useEffect(() => {
    if (!standardApps) return;
    for (const [id, config] of Object.entries(standardApps)) {
      if (!WCV_APPS.has(id) || !config.visible) continue;
      window.electron.view.create({ appId: id, url: config.url }).catch((err) =>
        console.error(`[WCV] Failed to create view for ${id}:`, err)
      );
    }
    // Cleanup: destroy WCV views and clear any periodic intervals on unmount
    return () => {
      for (const id of WCV_APPS) {
        window.electron.view.destroy(id).catch(() => {});
        clearInterval(wcvIntervalsRef.current[id]);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show/hide WCV views when the active app changes; apply zoom on show.
  useEffect(() => {
    if (!activeWebView) return;
    const id = activeWebView.id;
    if (!WCV_APPS.has(id)) return;
    window.electron.view.show(id);
    // Apply current zoom to the newly visible view
    applyZoom(null, id);
    return () => {
      window.electron.view.hide(id);
    };
  }, [activeWebView, applyZoom]);

  // Track navigation URL for WCV apps (used by getWcvProxy); also drive the
  // BBZ Chat loading overlay state when the schulcloud WCV navigates.
  useEffect(() => {
    const unsubscribe = window.electron.view.onEvent((event) => {
      if (!WCV_APPS.has(event.appId)) return;
      if (event.type === 'did-navigate' || event.type === 'did-navigate-in-page') {
        wcvUrlsRef.current[event.appId] = event.url;
        if (event.appId === 'schulcloud' && event.type === 'did-navigate') {
          if (event.url && event.url.includes('chat.bbz-rd-eck.com')) {
            setBbzChatLoginActive(true); // refined to false once login is confirmed
          } else if (event.url) {
            setBbzChatLoginActive(false);
          }
        }
      }
    });
    return unsubscribe;
  // setBbzChatLoginActive is a stable React setState setter
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loading state for WCV apps — mirrors what the webview events do for regular apps
  useEffect(() => {
    const unsubscribe = window.electron.view.onEvent((event) => {
      if (!WCV_APPS.has(event.appId)) return;
      if (event.type === 'did-start-loading') {
        setIsLoading(prev => ({ ...prev, [event.appId]: true }));
      } else if (event.type === 'did-stop-loading') {
        setIsLoading(prev => ({ ...prev, [event.appId]: false }));
      } else if (event.type === 'dom-ready') {
        const appId = event.appId;
        const proxy = getWcvProxy(appId);
        applyZoom(null, appId);

        if (appId === 'cryptpad') {
          // No credential injection; just suppress the "popups blocked" warning
          proxy.executeJavaScript(`
            window.open = new Proxy(window.open, {
              apply(target, thisArg, args) {
                const result = Reflect.apply(target, thisArg, args);
                return result || { closed: false };
              }
            });
            const warn = document.querySelector('.cp-popup-warning');
            if (warn) warn.remove();
          `).catch(() => {});

        } else if (appId === 'schulportal') {
          // Reset on each dom-ready so session-expiry triggers re-injection
          credsAreSet.current[appId] = false;
          injectCredentials(proxy, appId);
          // Periodic check in case login form reappears without a navigation
          clearInterval(wcvIntervalsRef.current[appId]);
          wcvIntervalsRef.current[appId] = setInterval(async () => {
            try {
              const needsLogin = await window.electron.view.executeJavaScript(appId, `(function() {
                const u = document.querySelector('input#username');
                const p = document.querySelector('input#password');
                const s = document.querySelector('input#kc-login[type="submit"]');
                return !!(u && p && s);
              })()`);
              if (needsLogin) {
                credsAreSet.current[appId] = false;
                injectCredentials(getWcvProxy(appId), appId);
              }
            } catch (_) {}
          }, 5000);

        } else if (appId === 'nextcloud') {
          // Multi-step ADFS chain: reset on every dom-ready so each step can inject
          credsAreSet.current[appId] = false;
          injectCredentials(proxy, appId);
          clearInterval(wcvIntervalsRef.current[appId]);
          wcvIntervalsRef.current[appId] = setInterval(async () => {
            try {
              const needsLogin = await window.electron.view.executeJavaScript(appId, `(function() {
                const adfs = document.querySelector('a[href*="user_saml/saml/login"]') ||
                             Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'BBZ ADFS');
                const u = document.querySelector('#userNameInput');
                const p = document.querySelector('#passwordInput');
                const ja = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');
                const ok = document.querySelector('#header') || document.querySelector('.app-navigation') ||
                           document.querySelector('#nextcloud') || window.location.href.includes('/apps/');
                return (adfs || u || p || ja) && !ok;
              })()`);
              if (needsLogin) {
                credsAreSet.current[appId] = false;
                injectCredentials(getWcvProxy(appId), appId);
              }
            } catch (_) {}
          }, 5000);

        } else if (appId === 'office') {
          // Multi-step Microsoft login: reset on every dom-ready
          credsAreSet.current[appId] = false;
          injectCredentials(proxy, appId);
          clearInterval(wcvIntervalsRef.current[appId]);
          wcvIntervalsRef.current[appId] = setInterval(async () => {
            try {
              const needsLogin = await window.electron.view.executeJavaScript(appId, `(function() {
                const email = document.querySelector('input[name="loginfmt"]#i0116[type="email"]');
                const pass  = document.querySelector('input[name="passwd"]#i0118[type="password"]');
                const weiter   = document.querySelector('input[type="submit"]#idSIButton9[value="Weiter"]');
                const anmelden = document.querySelector('input[type="submit"]#idSIButton9[value="Anmelden"]');
                const ja   = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');
                const tile = document.querySelector('div[data-bind*="session.tileDisplayName"]');
                const ok   = document.querySelector('.o365cs-nav-appTitle, .ms-Nav, .od-TopBar, [data-automation-id="appLauncher"]');
                return (email || pass || weiter || anmelden || ja || tile) && !ok;
              })()`);
              if (needsLogin) {
                credsAreSet.current[appId] = false;
                injectCredentials(getWcvProxy(appId), appId);
              }
            } catch (_) {}
          }, 5000);

        } else if (appId === 'outlook') {
          // Each ADFS navigation step fires dom-ready — reset so every step can inject
          credsAreSet.current[appId] = false;
          injectCredentials(proxy, appId);

        } else if (appId === 'schulcloud') {
          // schulcloud never sets credsAreSet = true (multi-step login manages its own state)
          injectCredentials(proxy, appId);
          // 5s periodic check — mirrors the webview's checkSchulCloudLogin interval
          clearInterval(wcvIntervalsRef.current[appId]);
          wcvIntervalsRef.current[appId] = setInterval(async () => {
            try {
              const currentUrl = wcvUrlsRef.current[appId] || '';
              const isBbzChatPage = currentUrl.includes('chat.bbz-rd-eck.com');
              const needsLogin = await window.electron.view.executeJavaScript(appId, `(function() {
                const isBbzChat = window.location.href.includes('chat.bbz-rd-eck.com');
                if (isBbzChat) {
                  const loginForm = document.querySelector('input[type="email"]');
                  const token = localStorage.getItem('schulchat_token');
                  return !!loginForm && !token;
                }
                const emailInput = document.querySelector('input#username[type="text"]');
                const passwordInputs = document.querySelectorAll('input[type="password"]');
                const loggedIn = document.querySelector('.user-menu') || document.querySelector('.dashboard') || document.querySelector('.main-content');
                const encryptionButton = Array.from(document.querySelectorAll('button.row, div.row')).find(btn => btn.textContent.includes('Durch dein Verschlüsselungskennwort'));
                const onEncryptionPage = !!encryptionButton || document.body.textContent.includes('Verschlüsselungskennwort');
                return ((emailInput || passwordInputs.length > 0) && !loggedIn) || (onEncryptionPage && !loggedIn);
              })()`);
              if (isBbzChatPage && needsLogin) {
                setBbzChatLoginActive(true);
              } else {
                setBbzChatLoginActive(false);
              }
              if (needsLogin) {
                injectCredentials(getWcvProxy(appId), appId);
              }
            } catch (_) {}
          }, 5000);

        } else if (appId === 'webuntis') {
          // 2s interval (same as webview path) — WebUntis login form loads async
          credsAreSet.current[appId] = false;
          injectCredentials(proxy, appId);
          clearInterval(wcvIntervalsRef.current[appId]);
          wcvIntervalsRef.current[appId] = setInterval(async () => {
            try {
              const isLoginPage = await window.electron.view.executeJavaScript(appId, `(function() {
                const form = document.querySelector('.un2-login-form form') || document.querySelector('form');
                const passInput = document.querySelector('input[type="password"]');
                const authLabel = document.querySelector('.un-input-group__label');
                return (form || passInput) && (!authLabel || authLabel.textContent !== 'Bestätigungscode');
              })()`);
              if (isLoginPage) {
                credsAreSet.current[appId] = false;
                injectCredentials(getWcvProxy(appId), appId);
              }
            } catch (_) {}
          }, 2000);

        } else {
          injectCredentials(proxy, appId);
        }
      }
    });
    return unsubscribe;
  // injectCredentials and applyZoom are stable useCallbacks; getWcvProxy too
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Bounds binding for the active WCV anchor div
  // -------------------------------------------------------------------------

  // Anchor ref for the currently active WCV app
  const activeWcvAnchorRef = useRef(null);
  const activeWcvId = activeWebView && WCV_APPS.has(activeWebView.id) ? activeWebView.id : null;

  // Keep activeWcvAnchorRef in sync with the active WCV anchor div
  useEffect(() => {
    if (activeWcvId) {
      activeWcvAnchorRef.current = wcvAnchorRefs.current[activeWcvId] || null;
    } else {
      activeWcvAnchorRef.current = null;
    }
  }, [activeWcvId]);

  useViewBoundsBinding(activeWcvAnchorRef, activeWcvId);

  // Forward badge-count updates sent by ViewManager (via page-title-updated for
  // BBZ Chat) to the main-process tray icon via the existing update-badge channel.
  useEffect(() => {
    if (!window.electron?.view?.onBadgeUpdate) return;
    const unsubscribe = window.electron.view.onBadgeUpdate(({ count }) => {
      window.electron.send('update-badge', count);
    });
    return unsubscribe;
  }, []);

  // -------------------------------------------------------------------------

  // Returns a proxy object for WCV apps so injectCredentials can work unmodified.
  // executeJavaScript is routed through IPC; getURL reads the cached URL.
  const getWcvProxy = useCallback((id) => ({
    executeJavaScript: (code, userGesture) =>
      window.electron.view.executeJavaScript(id, code, userGesture),
    getURL: () => wcvUrlsRef.current[id] || '',
    reload: () => window.electron.view.reload(id),
  }), []);

  // Function to inject credentials based on webview ID
  const injectCredentials = useCallback(async (webview, id) => {
    if (!webview || credsAreSet.current[id]) {
      return;
    }

    // Stop if we already had a fatal login failure for this app
    if (failedLogins.current[id]) {
      console.log(`[${id}] Previous login failed - stopping auto-login`);
      return;
    }

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

      // Skip injection if credentials are empty or whitespace-only
      if (!emailAddress?.trim() || !password?.trim() || (id === 'bbb' && !bbbPassword?.trim())) {
        console.log(`[${id}] Skipping credential injection - empty credentials`);
        return;
      }

      // Check login attempt limit (except for Outlook, WebUntis, and schulcloud)
      // schulcloud has a multi-step login process (email -> password -> encryption)
      // and the periodic check may trigger multiple times during this process
      if (id !== 'outlook' && id !== 'webuntis' && id !== 'schulcloud') {
        if (!loginAttempts.current[id]) {
          loginAttempts.current[id] = 0;
        }
        if (loginAttempts.current[id] >= MAX_LOGIN_ATTEMPTS) {
          console.log(`[${id}] Max login attempts (${MAX_LOGIN_ATTEMPTS}) reached - stopping auto-login`);
          return;
        }
        loginAttempts.current[id]++;
        console.log(`[${id}] Login attempt ${loginAttempts.current[id]}/${MAX_LOGIN_ATTEMPTS}`);
      }

      switch (id.toLowerCase()) {
        case 'webuntis':
          try {
            // Check cooldown period (15 minutes) to avoid disrupting 2FA process
            const COOLDOWN_MINUTES_WEBUNTIS = 15;
            
            // Use hostname-specific key to allow testing on new URLs without waiting
            let hostname = 'unknown';
            try {
              hostname = new URL(webview.getURL()).hostname;
            } catch (e) { console.warn('Could not get hostname for cooldown key'); }
            
            const storageKey = `webuntis_last_login_attempt_${hostname}`;
            const lastLoginAttemptWebuntis = localStorage.getItem(storageKey);
            const nowWebuntis = Date.now();
            
            if (lastLoginAttemptWebuntis) {
              const timeSinceLastAttempt = nowWebuntis - parseInt(lastLoginAttemptWebuntis, 10);
              const cooldownPeriod = COOLDOWN_MINUTES_WEBUNTIS * 60 * 1000; // 15 minutes in milliseconds
              
              if (timeSinceLastAttempt < cooldownPeriod) {
                const remainingMinutes = Math.ceil((cooldownPeriod - timeSinceLastAttempt) / (60 * 1000));
                console.log(`WebUntis login cooldown active for ${hostname}. ${remainingMinutes} minutes remaining.`);
                return;
              }
            }

            // Get WebUntis-specific credentials
            const webuntisEmailResult = await window.electron.getCredentials({
              service: 'bbzcloud',
              account: 'webuntisEmail'
            });
            const webuntisPasswordResult = await window.electron.getCredentials({
              service: 'bbzcloud',
              account: 'webuntisPassword'
            });

            if (!webuntisEmailResult.success || !webuntisPasswordResult.success) {
              return;
            }

            const webuntisEmail = webuntisEmailResult.password;
            const webuntisPassword = webuntisPasswordResult.password;

            if (!webuntisEmail || !webuntisPassword) {
              return;
            }

            const loginAttemptResult = await webview.executeJavaScript(`
              (async () => {
                try {
                  // Wait for form to be ready
                  await new Promise((resolve) => {
                    const checkForm = () => {
                      const form = document.querySelector('.un2-login-form form') || document.querySelector('form');
                      const passwordInput = document.querySelector('input[type="password"]');
                      if (form || passwordInput) {
                        resolve();
                      } else {
                        setTimeout(checkForm, 100);
                      }
                    };
                    checkForm();
                  });

                  // Get form elements - try specific selectors first, then fall back to generic ones
                  const form = document.querySelector('.un2-login-form form') || document.querySelector('form');
                  const usernameField = document.querySelector('input[type="text"].un-input-group__input') || document.querySelector('input[type="text"]');
                  const passwordField = document.querySelector('input[type="password"].un-input-group__input') || document.querySelector('input[type="password"]');
                  const submitButton = document.querySelector('button[type="submit"]');

                  if (!usernameField || !passwordField || !submitButton) {
                    return false;
                  }

                  // Function to find React fiber node
                  const getFiberNode = (element) => {
                    const key = Object.keys(element).find(key => 
                      key.startsWith('__reactFiber$') || 
                      key.startsWith('__reactInternalInstance$')
                    );
                    return element[key];
                  };

                  // Function to find React props
                  const getReactProps = (element) => {
                    const fiberNode = getFiberNode(element);
                    if (!fiberNode) return null;
                    
                    let current = fiberNode;
                    while (current) {
                      if (current.memoizedProps?.onChange) {
                        return current.memoizedProps;
                      }
                      current = current.return;
                    }
                    return null;
                  };

                  // Fill username
                  const usernameProps = getReactProps(usernameField);
                  if (usernameProps?.onChange) {
                    usernameField.value = ${JSON.stringify(webuntisEmail)};
                    usernameProps.onChange({
                      target: usernameField,
                      currentTarget: usernameField,
                      type: 'change',
                      bubbles: true,
                      cancelable: true,
                      defaultPrevented: false,
                      preventDefault: () => {},
                      stopPropagation: () => {},
                      isPropagationStopped: () => false,
                      persist: () => {}
                    });
                  }

                  // Wait a bit before password
                  await new Promise(resolve => setTimeout(resolve, 100));

                  // Fill password
                  const passwordProps = getReactProps(passwordField);
                  if (passwordProps?.onChange) {
                    passwordField.value = ${JSON.stringify(webuntisPassword)};
                    passwordProps.onChange({
                      target: passwordField,
                      currentTarget: passwordField,
                      type: 'change',
                      bubbles: true,
                      cancelable: true,
                      defaultPrevented: false,
                      preventDefault: () => {},
                      stopPropagation: () => {},
                      isPropagationStopped: () => false,
                      persist: () => {}
                    });
                  }

                  // Wait for button to become enabled
                  await new Promise(resolve => setTimeout(resolve, 500));

                  // Submit form if button is enabled
                  if (!submitButton.disabled) {
                    const formProps = getReactProps(form);
                    if (formProps?.onSubmit) {
                      formProps.onSubmit({
                        preventDefault: () => {},
                        stopPropagation: () => {},
                        target: form,
                        currentTarget: form,
                        nativeEvent: new Event('submit')
                      });
                    } else {
                      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                      form.dispatchEvent(submitEvent);
                    }

                    // Wait 2 seconds for response
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Check for invalid credentials error message
                    const bodyText = document.body.innerText || '';
                    if (bodyText.includes('Ungültiger Benutzername und/oder Passwort')) {
                      return 'INVALID_CREDENTIALS';
                    }
                    
                    // Only reload if we're not on the authenticator page
                    const authLabel = document.querySelector('.un-input-group__label');
                    if (authLabel?.textContent !== 'Bestätigungscode') {
                      window.location.reload();
                    }
                    return 'SUCCESS';
                  }

                  return false;
                } catch (error) {
                  return false;
                }
              })();
            `);

            if (loginAttemptResult === 'INVALID_CREDENTIALS') {
              failedLogins.current['webuntis'] = true;
              console.log('WebUntis login failed: Invalid credentials. Stopping auto-login.');
              toast({
                title: 'WebUntis Login fehlgeschlagen',
                description: 'Ungültiger Benutzername und/oder Passwort. Automatische Anmeldung gestoppt.',
                status: 'error',
                duration: null,
                isClosable: true,
              });
              return;
            }

            // Store timestamp only if login button was actually clicked (success or unknown state)
            if (loginAttemptResult === 'SUCCESS' || loginAttemptResult === true) {
              localStorage.setItem(storageKey, nowWebuntis.toString());
              console.log(`WebUntis login attempted for ${hostname}. 15-minute cooldown started.`);
            }

          } catch (error) {
            console.error('Error during WebUntis login:', error);
          }
          break;

        case 'outlook':
          await webview.executeJavaScript(
            `document.querySelector('#userNameInput').value = ${JSON.stringify(emailAddress)}; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#passwordInput').value = ${JSON.stringify(password)}; void(0);`
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
            `document.querySelector('input[name="username"][id="username"]').value = ${JSON.stringify(emailAddress.toLowerCase())}; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('input[name="password"][id="password"]').value = ${JSON.stringify(password)}; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('button[type="submit"][id="loginbtn"]').click();`
          );
          break;

        case 'bbb':
          await webview.executeJavaScript(
            `document.querySelector('#session_email').value = ${JSON.stringify(emailAddress)}; void(0);`
          );
          await webview.executeJavaScript(
            `document.querySelector('#session_password').value = ${JSON.stringify(bbbPassword)}; void(0);`
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
          // Check if login form exists and wait for it if necessary
          const formExists = await webview.executeJavaScript(`
            (async () => {
              // Wait for form elements to be ready (max 5 seconds)
              for (let i = 0; i < 50; i++) {
                const userInput = document.querySelector('#userNameInput');
                const passwordInput = document.querySelector('#passwordInput');
                const submitButton = document.querySelector('#submitButton');
                
                if (userInput && passwordInput && submitButton) {
                  return true;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              return false;
            })()
          `);

          if (formExists) {
            await webview.executeJavaScript(
              `document.querySelector('#userNameInput').value = ${JSON.stringify(emailAddress)}; void(0);`
            );
            await webview.executeJavaScript(
              `document.querySelector('#passwordInput').value = ${JSON.stringify(password)}; void(0);`
            );
            await webview.executeJavaScript(
              `document.querySelector('#submitButton').click();`
            );
            await sleep(5000);
            webview.reload();
          }
          break;

        case 'schulcloud':
          try {
            console.log('[schul.cloud] === Starting credential injection ===');
            
            // Get encryption password for schul.cloud / BBZ Chat
            const schulcloudEncryptionResult = await window.electron.getCredentials({
              service: 'bbzcloud',
              account: 'schulcloudEncryptionPassword'
            });
            const schulcloudEncryptionPassword = schulcloudEncryptionResult.success ? schulcloudEncryptionResult.password : null;
            console.log('[schul.cloud] Encryption password loaded:', schulcloudEncryptionPassword ? 'YES' : 'NO');

            // Check if we're on BBZ Chat (chat.bbz-rd-eck.com)
            const currentUrl = webview.getURL();
            const isBbzChat = currentUrl.includes('chat.bbz-rd-eck.com');
            console.log('[schul.cloud] Current URL:', currentUrl);
            console.log('[schul.cloud] Is BBZ Chat:', isBbzChat);

            // If BBZ Chat, bypass the React login form entirely by calling
            // the API directly. This avoids all React internals / controlled input issues.
            // stashcat-chat's POST /api/login returns {token, user}, and the app
            // reads the token from localStorage('schulchat_token') on startup.
            if (isBbzChat) {
              const loginResult = await webview.executeJavaScript(`
                (async function() {
                  try {
                    // Check if token exists in localStorage
                    const existingToken = localStorage.getItem('schulchat_token');
                    if (existingToken) {
                      // Trust the token — if invalid, the app will handle auth on next navigation
                      console.log('[BBZ Chat] Token found, assuming valid');
                      return 'ALREADY_LOGGED_IN';
                    }

                    console.log('[BBZ Chat] No token, calling /api/login...');
                    const response = await fetch('/api/login', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        email: ${JSON.stringify(emailAddress)},
                        password: ${JSON.stringify(password)},
                        securityPassword: ${JSON.stringify(schulcloudEncryptionPassword || password)}
                      })
                    });

                    if (!response.ok) {
                      const errorText = await response.text();
                      console.error('[BBZ Chat] Login API error:', response.status, errorText);
                      return 'API_ERROR_' + response.status;
                    }

                    const data = await response.json();
                    if (data.token) {
                      localStorage.setItem('schulchat_token', data.token);
                      console.log('[BBZ Chat] Token stored, reloading...');
                      return 'TOKEN_STORED';
                    } else {
                      console.error('[BBZ Chat] No token in response:', JSON.stringify(data));
                      return 'NO_TOKEN';
                    }
                  } catch (err) {
                    console.error('[BBZ Chat] Login fetch error:', err.message);
                    return 'FETCH_ERROR';
                  }
                })()
              `);

              console.log('[BBZ Chat] Login result:', loginResult);

              if (loginResult === 'TOKEN_STORED') {
                // Token saved — reload the page so the app picks it up
                credsAreSet.current[id] = true;
                webview.reload();
                break;
              }

              if (loginResult === 'ALREADY_LOGGED_IN') {
                credsAreSet.current[id] = true;
                break;
              }

              // API error or fetch error — allow retry for temporary failures
              if (loginResult.startsWith('API_ERROR') || loginResult === 'FETCH_ERROR') {
                console.warn('[BBZ Chat] Login failed (temporary):', loginResult, '- will retry on next check');
                // DON'T set credsAreSet - allow retry on next periodic check
                // The 5-second interval check will try again
                break;
              }

              break;
            }

            // Fall back to schul.cloud logic
            console.log('[schul.cloud] Using schul.cloud login logic');
            
            // Detect login state using exact schul.cloud selectors
            const loginState = await webview.executeJavaScript(`
              (function() {
                console.log('[schul.cloud] Detecting login state...');
                
                // Look for specific schul.cloud elements
                const emailInput = document.querySelector('input#username[type="text"]');
                const passwordInputs = document.querySelectorAll('input[type="password"]');
                const weiterButton = document.querySelector('button[type="submit"].btn.btn-contained');
                const loginButton = Array.from(document.querySelectorAll('span.header')).find(el => el.textContent.includes('Anmelden mit Passwort')) ||
                                  Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Anmelden mit Passwort')) ||
                                  document.querySelector('[title*="Anmelden"]');

                // Check for remember login checkbox (input#stayLoggedInCheck)
                const rememberCheckbox = document.querySelector('input#stayLoggedInCheck');

                // Find encryption password field
                let encryptionInput = null;
                for (const input of passwordInputs) {
                  const parentAppLabel = input.closest('app-label-input');
                  const hasEncryptionTestId = parentAppLabel && parentAppLabel.getAttribute('data-test-id') === 'set-private-key-password_pass_if';
                  const hasEncryptionLabel = parentAppLabel && parentAppLabel.textContent.includes('Verschlüsselungskennwort');
                  if (hasEncryptionTestId || hasEncryptionLabel) {
                    encryptionInput = input;
                    break;
                  }
                }

                // Check if already logged in or on encryption/auth page
                // IMPORTANT: Only check actual DOM elements for logged-in state
                // Do NOT check textContent for 'Logout' or 'Abmelden' - these appear in
                // script tags and cause false positives on the login page!
                const loggedIn = document.querySelector('.user-menu') ||
                               document.querySelector('.dashboard') ||
                               document.querySelector('.main-content');
                const onEncryptionPage = document.body.textContent.includes('Verschlüsselungskennwort') || document.body.textContent.includes('Smartphone');

                const state = {
                  emailInput: !!emailInput,
                  passwordInputs: passwordInputs.length,
                  weiterButton: !!weiterButton,
                  loginButton: !!loginButton,
                  rememberCheckbox: !!rememberCheckbox,
                  hasEncryptionInput: !!encryptionInput,
                  encryptionInputIndex: encryptionInput ? Array.from(passwordInputs).indexOf(encryptionInput) : -1,
                  loggedIn: !!loggedIn,
                  onEncryptionPage: !!onEncryptionPage,
                  url: window.location.href,
                  title: document.title,
                  bodyText: document.body.textContent.substring(0, 200) // First 200 chars for debugging
                };
                
                console.log('[schul.cloud] Login state:', JSON.stringify(state, null, 2));
                return state;
              })()
            `);

            console.log('[schul.cloud] Login state detected:', JSON.stringify(loginState, null, 2));

            if (loginState.loggedIn) {
              // Already logged in or on post-login page, no action needed
              return;
            }

            if (loginState.emailInput && !loginState.passwordInputs) {
              // Email page - fill email and click Weiter
              console.log('[schul.cloud] Email page detected - filling email field');
              
              const result = await webview.executeJavaScript(`
                (function() {
                  try {
                    const emailInput = document.querySelector('input#username[type="text"]');
                    const weiterButton = document.querySelector('button[type="submit"].btn.btn-contained');

                    console.log('[schul.cloud] Email input found:', !!emailInput);
                    console.log('[schul.cloud] Weiter button found:', !!weiterButton);

                    if (emailInput && weiterButton) {
                      console.log('[schul.cloud] Filling email:', ${JSON.stringify(emailAddress)});
                      
                      // Method 1: Direct value set with native setter override
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                      nativeInputValueSetter.call(emailInput, ${JSON.stringify(emailAddress)});
                      
                      // Method 2: Also set value directly (fallback)
                      emailInput.value = ${JSON.stringify(emailAddress)};
                      
                      emailInput.focus();
                      emailInput.select();

                      // Trigger Angular events in correct order
                      const events = ['input', 'change', 'keydown', 'keyup', 'blur', 'focus'];
                      events.forEach(eventType => {
                        emailInput.dispatchEvent(new Event(eventType, { bubbles: true }));
                      });
                      
                      // Also try React-specific events
                      emailInput.dispatchEvent(new Event('textInput', { bubbles: true }));

                      console.log('[schul.cloud] Email filled, waiting 1000ms then clicking Weiter...');

                      // Wait then click Weiter button
                      setTimeout(() => {
                        console.log('[schul.cloud] Attempting to click Weiter button');
                        weiterButton.click();
                        console.log('[schul.cloud] Weiter button clicked');
                      }, 1000);

                      return 'SUCCESS';
                    }
                    
                    return 'NO_ELEMENTS';
                  } catch (err) {
                    console.error('[schul.cloud] Error filling email:', err);
                    return 'ERROR: ' + err.message;
                  }
                })()
              `);

              console.log('[schul.cloud] Email injection result:', result);
              
            } else if (loginState.passwordInputs && !loginState.onEncryptionPage) {
              // Password page - fill password, check remember me, and submit
              console.log('[schul.cloud] Password page detected - filling password');
              
              const result = await webview.executeJavaScript(`
                (function() {
                  try {
                    // Find password input but exclude encryption password field
                    const allPasswordInputs = document.querySelectorAll('input[type="password"]');
                    let passwordInput = null;

                    console.log('[schul.cloud] Found', allPasswordInputs.length, 'password input(s)');

                    // Filter out encryption password field
                    for (const input of allPasswordInputs) {
                      const parentAppLabel = input.closest('app-label-input');
                      const hasEncryptionTestId = parentAppLabel && parentAppLabel.getAttribute('data-test-id') === 'set-private-key-password_pass_if';
                      const hasEncryptionLabel = parentAppLabel && parentAppLabel.textContent.includes('Verschlüsselungskennwort');

                      // Skip if this is the encryption password field
                      if (hasEncryptionTestId || hasEncryptionLabel) {
                        console.log('[schul.cloud] Skipping encryption password field');
                        continue;
                      }

                      // This should be the regular login password
                      passwordInput = input;
                      console.log('[schul.cloud] Using login password input at index', Array.from(allPasswordInputs).indexOf(input));
                      break;
                    }

                    const rememberCheckbox = document.querySelector('input#stayLoggedInCheck');
                    const loginButton = Array.from(document.querySelectorAll('span.header')).find(el => el.textContent.includes('Anmelden mit Passwort')) ||
                                      Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Anmelden mit Passwort'));

                    if (passwordInput) {
                      console.log('[schul.cloud] Filling login password (not encryption password)');
                      
                      // Use native setter to bypass Angular control
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                      nativeInputValueSetter.call(passwordInput, ${JSON.stringify(password)});
                      
                      // Also set directly as fallback
                      passwordInput.value = ${JSON.stringify(password)};
                      
                      passwordInput.focus();

                      // Trigger Angular events
                      const events = ['input', 'change', 'keydown', 'keyup', 'blur', 'focus'];
                      events.forEach(eventType => {
                        passwordInput.dispatchEvent(new Event(eventType, { bubbles: true }));
                      });
                      passwordInput.dispatchEvent(new Event('textInput', { bubbles: true }));

                      // Click remember login checkbox if available
                      if (rememberCheckbox) {
                        console.log('[schul.cloud] Clicking remember login checkbox');
                        rememberCheckbox.click();
                      }

                      // Wait then click login button
                      setTimeout(() => {
                        if (loginButton) {
                          console.log('[schul.cloud] Clicking login button');
                          loginButton.click();
                        } else {
                          // Try to find the parent button element
                          const parentButton = document.querySelector('button[type="submit"]');
                          if (parentButton) {
                            console.log('[schul.cloud] Clicking parent login button');
                            parentButton.click();
                          } else {
                            console.log('[schul.cloud] No submit button found!');
                          }
                        }
                      }, 1000);

                      return 'SUCCESS';
                    } else {
                      console.log('[schul.cloud] No valid login password field found (encryption password excluded)');
                      return 'NO_PASSWORD_FIELD';
                    }
                  } catch (err) {
                    console.error('[schul.cloud] Error filling password:', err);
                    return 'ERROR: ' + err.message;
                  }
                })()
              `);

              console.log('[schul.cloud] Password injection result:', result);
              
            } else if (loginState.onEncryptionPage && schulcloudEncryptionPassword) {
              // Encryption password page - need to click "Durch dein Verschlüsselungskennwort" first, then fill password
              console.log('[schul.cloud] Encryption page detected - handling encryption password');
              
              const pageState = await webview.executeJavaScript(`
                (function() {
                  console.log('[schul.cloud] Checking encryption page state...');
                  
                  // Check for "Durch dein Verschlüsselungskennwort" button (with data-icon="password")
                  const encryptionButton = Array.from(document.querySelectorAll('button.row, div.row')).find(btn =>
                    btn.textContent.includes('Durch dein Verschlüsselungskennwort')
                  );

                  const passwordInputs = document.querySelectorAll('input[type="password"]');
                  const weiterButton = Array.from(document.querySelectorAll('button')).find(btn =>
                    btn.textContent.includes('Weiter')
                  );

                  const state = {
                    hasEncryptionButton: !!encryptionButton,
                    passwordInputCount: passwordInputs.length,
                    hasWeiterButton: !!weiterButton,
                    // Check if password field is already visible (after clicking encryption button)
                    passwordInputVisible: passwordInputs.length > 0 && passwordInputs[0].offsetParent !== null
                  };
                  
                  console.log('[schul.cloud] Encryption page state:', JSON.stringify(state, null, 2));
                  return state;
                })()
              `);

              console.log('[schul.cloud] Encryption page state:', JSON.stringify(pageState, null, 2));

              // Wait a bit for the page to settle
              await new Promise(resolve => setTimeout(resolve, 500));

              // Check if we need to click the encryption button first
              if (pageState.hasEncryptionButton) {
                console.log('[schul.cloud] Clicking encryption button first');
                
                // Click "Durch dein Verschlüsselungskennwort" button
                const clicked = await webview.executeJavaScript(`
                  (function() {
                    const encryptionButton = Array.from(document.querySelectorAll('button.row, div.row')).find(btn =>
                      btn.textContent.includes('Durch dein Verschlüsselungskennwort')
                    );
                    if (encryptionButton) {
                      console.log('[schul.cloud] Clicking encryption button');
                      encryptionButton.click();
                      return true;
                    }
                    console.log('[schul.cloud] Encryption button not found!');
                    return false;
                  })()
                `);

                console.log('[schul.cloud] Encryption button clicked:', clicked);
                
                // Wait for password field to appear
                await new Promise(resolve => setTimeout(resolve, 1500));
              }

              // Now fill encryption password and click Weiter
              const result = await webview.executeJavaScript(`
                (function() {
                  try {
                    const passwordInputs = document.querySelectorAll('input[type="password"]');
                    const weiterButton = Array.from(document.querySelectorAll('button')).find(btn =>
                      btn.textContent.includes('Weiter')
                    );

                    console.log('[schul.cloud] Found', passwordInputs.length, 'password input(s) on encryption page');

                    // Find the visible password input
                    let encryptionInput = null;
                    for (const input of passwordInputs) {
                      if (input.offsetParent !== null) {
                        encryptionInput = input;
                        console.log('[schul.cloud] Found visible encryption input');
                        break;
                      }
                    }

                    if (!encryptionInput && passwordInputs.length > 0) {
                      encryptionInput = passwordInputs[0];
                      console.log('[schul.cloud] Using first password input as fallback');
                    }

                    if (encryptionInput && ${JSON.stringify(schulcloudEncryptionPassword)}) {
                      console.log('[schul.cloud] Filling encryption password');
                      
                      // Use native setter
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                      nativeInputValueSetter.call(encryptionInput, ${JSON.stringify(schulcloudEncryptionPassword)});
                      
                      encryptionInput.value = ${JSON.stringify(schulcloudEncryptionPassword)};
                      encryptionInput.focus();

                      // Trigger Angular events
                      const events = ['input', 'change', 'keydown', 'keyup', 'blur', 'focus'];
                      events.forEach(eventType => {
                        encryptionInput.dispatchEvent(new Event(eventType, { bubbles: true }));
                      });
                      encryptionInput.dispatchEvent(new Event('textInput', { bubbles: true }));

                      console.log('[schul.cloud] Encryption password filled, waiting then clicking Weiter...');

                      // Wait then click Weiter button
                      setTimeout(() => {
                        if (weiterButton) {
                          console.log('[schul.cloud] Clicking Weiter button');
                          weiterButton.click();
                        } else {
                          console.log('[schul.cloud] No Weiter button found!');
                        }
                      }, 1000);

                      return 'SUCCESS';
                    } else {
                      console.log('[schul.cloud] No encryption password field or password set');
                      return 'NO_FIELD_OR_PASSWORD';
                    }
                  } catch (err) {
                    console.error('[schul.cloud] Error filling encryption password:', err);
                    return 'ERROR: ' + err.message;
                  }
                })()
              `);

              console.log('[schul.cloud] Encryption password injection result:', result);
            } else {
              // No login state matched - log detailed info for debugging
              console.log('[schul.cloud] No login action taken - state does not match any condition');
              console.log('[schul.cloud] Conditions:');
              console.log('  - emailInput:', loginState.emailInput);
              console.log('  - passwordInputs:', loginState.passwordInputs);
              console.log('  - onEncryptionPage:', loginState.onEncryptionPage);
              console.log('  - loggedIn:', loginState.loggedIn);
              console.log('  - hasEncryptionInput:', loginState.hasEncryptionInput);
              console.log('  - schulcloudEncryptionPassword:', schulcloudEncryptionPassword ? 'SET' : 'NOT SET');
            }
          } catch (error) {
            console.error('[schul.cloud] Error during schul.cloud login:', error);
            console.error('[schul.cloud] Error stack:', error.stack);
          }
          break;

        case 'antraege':
          try {
            // Check cooldown period (15 minutes) to avoid disrupting 2FA process
            const COOLDOWN_MINUTES_WEBUNTIS = 15;
            
            // Use hostname-specific key to allow testing on new URLs without waiting
            let hostname = 'unknown';
            try {
              hostname = new URL(webview.getURL()).hostname;
            } catch (e) { console.warn('Could not get hostname for cooldown key'); }
            
            const storageKey = `webuntis_last_login_attempt_${hostname}`;
            const lastLoginAttemptWebuntis = localStorage.getItem(storageKey);
            const nowWebuntis = Date.now();
            
            if (lastLoginAttemptWebuntis) {
              const timeSinceLastAttempt = nowWebuntis - parseInt(lastLoginAttemptWebuntis, 10);
              const cooldownPeriod = COOLDOWN_MINUTES_WEBUNTIS * 60 * 1000; // 15 minutes in milliseconds
              
              if (timeSinceLastAttempt < cooldownPeriod) {
                const remainingMinutes = Math.ceil((cooldownPeriod - timeSinceLastAttempt) / (60 * 1000));
                console.log(`WebUntis login cooldown active for ${hostname}. ${remainingMinutes} minutes remaining.`);
                return;
              }
            }

            // Get Anträge credentials (uses WebUntis email/Lehrerkürzel and standard password)
            const antraegeEmailResult = await window.electron.getCredentials({
              service: 'bbzcloud',
              account: 'webuntisEmail'
            });

            if (!antraegeEmailResult.success || !antraegeEmailResult.password) {
              return;
            }

            const antraegeUsername = antraegeEmailResult.password;

            // Inject credentials into the agorum login form
            const loginResult = await webview.executeJavaScript(`
              (async () => {
                try {
                  // Wait for form to be ready
                  await new Promise((resolve) => {
                    const checkForm = () => {
                      const usernameField = document.querySelector('input[autocomplete="username"]');
                      const passwordField = document.querySelector('input[autocomplete="current-password"]');
                      if (usernameField && passwordField) {
                        resolve();
                      } else {
                        setTimeout(checkForm, 100);
                      }
                    };
                    checkForm();
                  });

                  // Get form elements
                  const usernameField = document.querySelector('input[autocomplete="username"]');
                  const passwordField = document.querySelector('input[autocomplete="current-password"]');
                  const rememberCheckbox = document.querySelector('input.x-form-checkbox[type="button"]');
                  const loginButton = Array.from(document.querySelectorAll('a.x-btn')).find(btn => 
                    btn.textContent.includes('Anmelden')
                  );

                  if (!usernameField || !passwordField || !loginButton) {
                    return false;
                  }

                  // Fill username
                  usernameField.value = ${JSON.stringify(antraegeUsername)};
                  usernameField.dispatchEvent(new Event('input', { bubbles: true }));
                  usernameField.dispatchEvent(new Event('change', { bubbles: true }));

                  // Wait a bit
                  await new Promise(resolve => setTimeout(resolve, 200));

                  // Fill password
                  passwordField.value = ${JSON.stringify(password)};
                  passwordField.dispatchEvent(new Event('input', { bubbles: true }));
                  passwordField.dispatchEvent(new Event('change', { bubbles: true }));

                  // Check "remember me" checkbox if available
                  if (rememberCheckbox && !rememberCheckbox.closest('.x-form-cb-checked')) {
                    rememberCheckbox.click();
                  }

                  // Wait a bit before clicking login
                  await new Promise(resolve => setTimeout(resolve, 300));

                  // Click login button
                  if (loginButton) {
                    loginButton.click();
                    return true;
                  }

                  return false;
                } catch (error) {
                  console.error('Error during Anträge login:', error);
                  return false;
                }
              })();
            `);

            // Store timestamp only if login button was actually clicked
          } catch (error) {
            console.error('Error during Anträge login:', error);
          }
          break;

        case 'schulportal':
          try {
            // Get Schulportal credentials
            const schulportalEmailResult = await window.electron.getCredentials({
              service: 'bbzcloud',
              account: 'schulportalEmail'
            });
            const schulportalPasswordResult = await window.electron.getCredentials({
              service: 'bbzcloud',
              account: 'schulportalPassword'
            });

            if (!schulportalEmailResult.success || !schulportalPasswordResult.success) {
              return;
            }

            const schulportalEmail = schulportalEmailResult.password;
            const schulportalPassword = schulportalPasswordResult.password;

            if (!schulportalEmail || !schulportalPassword) {
              return;
            }

            // Inject credentials into Schulportal login form
            await webview.executeJavaScript(`
              (async () => {
                try {
                  // Wait for form to be ready
                  await new Promise((resolve) => {
                    const checkForm = () => {
                      const usernameField = document.querySelector('input#username');
                      const passwordField = document.querySelector('input#password');
                      if (usernameField && passwordField) {
                        resolve();
                      } else {
                        setTimeout(checkForm, 100);
                      }
                    };
                    checkForm();
                  });

                  const usernameField = document.querySelector('input#username');
                  const passwordField = document.querySelector('input#password');
                  const submitButton = document.querySelector('input#kc-login[type="submit"]');

                  if (usernameField && passwordField && submitButton) {
                    usernameField.value = ${JSON.stringify(schulportalEmail)};
                    usernameField.dispatchEvent(new Event('input', { bubbles: true }));
                    usernameField.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    passwordField.value = ${JSON.stringify(schulportalPassword)};
                    passwordField.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordField.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    setTimeout(() => {
                      submitButton.click();
                    }, 500);
                    
                    return true;
                  }
                  return false;
                } catch (error) {
                  return false;
                }
              })();
            `);
          } catch (error) {
            console.error('Error during Schulportal login:', error);
          }
          break;

        case 'office':
          try {
            // Detect Office.com login state using exact selectors
            const loginState = await webview.executeJavaScript(`
              (function() {
                // Look for specific Office.com elements
                const emailInput = document.querySelector('input[name="loginfmt"]#i0116[type="email"]');
                const passwordInput = document.querySelector('input[name="passwd"]#i0118[type="password"]');
                const weiterButton = document.querySelector('input[type="submit"]#idSIButton9[value="Weiter"]');
                const anmeldenButton = document.querySelector('input[type="submit"]#idSIButton9[value="Anmelden"]');
                const jaButton = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');
                
                // Check for account selection tile
                const emailTile = document.querySelector('div[data-bind*="session.tileDisplayName"]');
                
                // Check if already logged in (look for Office apps or user menu)
                const officeApps = document.querySelector('.o365cs-nav-appTitle, .ms-Nav, .od-TopBar, [data-automation-id="appLauncher"]') ||
                                 document.body.textContent.includes('Office') ||
                                 document.body.textContent.includes('Microsoft 365');
                
                return {
                  emailInput: !!emailInput,
                  passwordInput: !!passwordInput,
                  weiterButton: !!weiterButton,
                  anmeldenButton: !!anmeldenButton,
                  jaButton: !!jaButton,
                  emailTile: !!emailTile,
                  loggedIn: !!officeApps,
                  url: window.location.href,
                  title: document.title
                };
              })()
            `);

            console.log('Office.com login state:', loginState);

            if (loginState.loggedIn) {
              // Already logged in, no action needed
              return;
            }

            if (loginState.emailInput && !loginState.passwordInput) {
              // Email page - fill email and click Weiter
              const result = await webview.executeJavaScript(`
                (function() {
                  const emailInput = document.querySelector('input[name="loginfmt"]#i0116[type="email"]');
                  const weiterButton = document.querySelector('input[type="submit"]#idSIButton9[value="Weiter"]');
                  
                  if (emailInput && weiterButton) {
                    console.log('Filling Office email:', ${JSON.stringify(emailAddress)});
                    emailInput.value = ${JSON.stringify(emailAddress)};
                    emailInput.focus();
                    
                    // Trigger Microsoft form events
                    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                    emailInput.dispatchEvent(new Event('change', { bubbles: true }));
                    emailInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    // Wait then click Weiter button
                    setTimeout(() => {
                      console.log('Clicking Office Weiter button');
                      weiterButton.click();
                    }, 1000);
                    
                    return true;
                  }
                  return false;
                })()
              `);
              
              console.log('Office email injection result:', result);
              
            } else if (loginState.emailTile && !loginState.passwordInput) {
              // Account selection page - click on email tile
              const result = await webview.executeJavaScript(`
                (function() {
                  const emailTile = document.querySelector('div[data-bind*="session.tileDisplayName"]');
                  
                  if (emailTile) {
                    console.log('Clicking Office email tile');
                    
                    // Look for the clickable parent element
                    let clickableElement = emailTile;
                    let parent = emailTile.parentElement;
                    while (parent && parent !== document.body) {
                      if (parent.tagName === 'BUTTON' || 
                          parent.onclick || 
                          parent.getAttribute('role') === 'button' ||
                          parent.style.cursor === 'pointer' ||
                          parent.classList.contains('tile') ||
                          parent.classList.contains('account')) {
                        clickableElement = parent;
                        break;
                      }
                      parent = parent.parentElement;
                    }
                    
                    // Click the element
                    clickableElement.click();
                    return true;
                  }
                  return false;
                })()
              `);
              
              console.log('Office email tile click result:', result);
              
            } else if (loginState.passwordInput) {
              // Password page - fill password and submit
              const result = await webview.executeJavaScript(`
                (function() {
                  const passwordInput = document.querySelector('input[name="passwd"]#i0118[type="password"]');
                  const anmeldenButton = document.querySelector('input[type="submit"]#idSIButton9[value="Anmelden"]');
                  
                  if (passwordInput && anmeldenButton) {
                    console.log('Filling Office password');
                    passwordInput.value = ${JSON.stringify(password)};
                    passwordInput.focus();
                    
                    // Trigger Microsoft form events
                    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
                    passwordInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    // Wait then click Anmelden button
                    setTimeout(() => {
                      console.log('Clicking Office Anmelden button');
                      anmeldenButton.click();
                    }, 1000);
                    
                    return true;
                  }
                  return false;
                })()
              `);
              
              console.log('Office password injection result:', result);
              
            } else if (loginState.jaButton) {
              // "Stay signed in?" page - click Ja
              const result = await webview.executeJavaScript(`
                (function() {
                  const jaButton = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');

                  if (jaButton) {
                    console.log('Clicking Office Ja button');

                    setTimeout(() => {
                      jaButton.click();
                    }, 500);

                    return true;
                  }
                  return false;
                })()
              `);

              console.log('Office Ja button click result:', result);
            }
          } catch (error) {
            console.error('Error during Office login:', error);
          }
          break;

        case 'nextcloud':
          try {
            const ncLoginState = await webview.executeJavaScript(`
              (function() {
                // Step 1: BBZ ADFS button on Nextcloud login page
                const adfsButton = document.querySelector('a[href*="user_saml/saml/login"]') ||
                                   Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'BBZ ADFS');

                // Step 2: ADFS login form (same as Outlook)
                const userNameInput = document.querySelector('#userNameInput');
                const passwordInput = document.querySelector('#passwordInput');
                const submitButton = document.querySelector('#submitButton');

                // Step 3: "Stay signed in?" page
                const jaButton = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');

                // Already logged in to Nextcloud
                const loggedIn = document.querySelector('#header') ||
                                 document.querySelector('.app-navigation') ||
                                 document.querySelector('#nextcloud') ||
                                 window.location.href.includes('/apps/');

                return {
                  adfsButton: !!adfsButton,
                  userNameInput: !!userNameInput,
                  passwordInput: !!passwordInput,
                  submitButton: !!submitButton,
                  jaButton: !!jaButton,
                  loggedIn: !!loggedIn,
                  url: window.location.href
                };
              })()
            `);

            console.log('Nextcloud login state:', ncLoginState);

            if (ncLoginState.loggedIn) {
              return;
            }

            if (ncLoginState.adfsButton) {
              // Click the BBZ ADFS button to initiate SAML login
              console.log('[Nextcloud] ADFS button found - initiating SAML login');
              
              const result = await webview.executeJavaScript(`
                (function() {
                  try {
                    const adfsButton = document.querySelector('a[href*="user_saml/saml/login"]') ||
                                       Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'BBZ ADFS');
                    
                    if (adfsButton) {
                      console.log('[Nextcloud] Found ADFS button');
                      console.log('[Nextcloud] Button href (raw):', adfsButton.getAttribute('href'));
                      console.log('[Nextcloud] Button href (resolved):', adfsButton.href);
                      
                      // Method 1: Try creating a proper URL with decoded entities
                      let targetUrl = adfsButton.href;
                      
                      // Decode HTML entities in URL
                      if (targetUrl) {
                        const textarea = document.createElement('textarea');
                        textarea.innerHTML = targetUrl;
                        targetUrl = textarea.value;
                        console.log('[Nextcloud] Decoded URL:', targetUrl);
                      }
                      
                      if (targetUrl) {
                        console.log('[Nextcloud] Navigating to decoded URL');
                        window.location.href = targetUrl;
                        return 'NAVIGATED';
                      }
                      
                      // Method 2: Fallback - dispatch proper mouse events
                      console.log('[Nextcloud] Fallback: dispatching mouse events');
                      const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        detail: 1,
                        button: 0
                      });
                      adfsButton.dispatchEvent(clickEvent);
                      return 'CLICK_DISPATCHED';
                    }
                    
                    console.log('[Nextcloud] ADFS button not found!');
                    return 'BUTTON_NOT_FOUND';
                  } catch (err) {
                    console.error('[Nextcloud] Error clicking ADFS button:', err);
                    return 'ERROR: ' + err.message;
                  }
                })()
              `);
              
              console.log('[Nextcloud] ADFS button click result:', result);
            } else if (ncLoginState.userNameInput && ncLoginState.passwordInput && ncLoginState.submitButton) {
              // ADFS login form - fill credentials (same form as Outlook)
              console.log('[Nextcloud] ADFS login form detected - filling credentials');
              
              const result = await webview.executeJavaScript(`
                (function() {
                  try {
                    const userNameInput = document.querySelector('#userNameInput');
                    const passwordInput = document.querySelector('#passwordInput');
                    const submitButton = document.querySelector('#submitButton');

                    console.log('[Nextcloud] Filling ADFS credentials');
                    console.log('[Nextcloud] Username:', ${JSON.stringify(emailAddress)});

                    // Fill username with native setter
                    if (userNameInput) {
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                      nativeInputValueSetter.call(userNameInput, ${JSON.stringify(emailAddress)});
                      userNameInput.value = ${JSON.stringify(emailAddress)};
                      
                      // Trigger events
                      userNameInput.dispatchEvent(new Event('input', { bubbles: true }));
                      userNameInput.dispatchEvent(new Event('change', { bubbles: true }));
                      console.log('[Nextcloud] Username filled');
                    }

                    // Fill password with native setter
                    if (passwordInput) {
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                      nativeInputValueSetter.call(passwordInput, ${JSON.stringify(password)});
                      passwordInput.value = ${JSON.stringify(password)};
                      
                      // Trigger events
                      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
                      console.log('[Nextcloud] Password filled');
                    }

                    // Click submit button after a short delay
                    if (submitButton) {
                      setTimeout(() => {
                        console.log('[Nextcloud] Clicking submit button');
                        submitButton.click();
                      }, 500);
                    }

                    return 'SUCCESS';
                  } catch (err) {
                    console.error('[Nextcloud] Error filling ADFS credentials:', err);
                    return 'ERROR: ' + err.message;
                  }
                })()
              `);
              
              console.log('[Nextcloud] ADFS credential injection result:', result);
            } else if (ncLoginState.jaButton) {
              // "Stay signed in?" page - click Ja
              console.log('[Nextcloud] "Stay signed in?" page detected - clicking Ja');
              
              const result = await webview.executeJavaScript(`
                (function() {
                  try {
                    const jaButton = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');
                    
                    if (jaButton) {
                      console.log('[Nextcloud] Found Ja button, clicking in 500ms');
                      setTimeout(() => {
                        jaButton.click();
                        console.log('[Nextcloud] Ja button clicked');
                      }, 500);
                      return 'SUCCESS';
                    }
                    
                    console.log('[Nextcloud] Ja button not found!');
                    return 'BUTTON_NOT_FOUND';
                  } catch (err) {
                    console.error('[Nextcloud] Error clicking Ja button:', err);
                    return 'ERROR: ' + err.message;
                  }
                })()
              `);
              
              console.log('[Nextcloud] Ja button click result:', result);
            } else {
              // No login state matched - log for debugging
              console.log('[Nextcloud] No login action taken - state does not match any condition');
              console.log('[Nextcloud] Conditions:');
              console.log('  - adfsButton:', ncLoginState.adfsButton);
              console.log('  - userNameInput:', ncLoginState.userNameInput);
              console.log('  - passwordInput:', ncLoginState.passwordInput);
              console.log('  - submitButton:', ncLoginState.submitButton);
              console.log('  - jaButton:', ncLoginState.jaButton);
              console.log('  - loggedIn:', ncLoginState.loggedIn);
              console.log('  - url:', ncLoginState.url);
            }
          } catch (error) {
            console.error('[Nextcloud] Error during Nextcloud login:', error);
            console.error('[Nextcloud] Error stack:', error.stack);
          }
          break;

        // NOTE: BBZ Chat uses the 'schulcloud' webview ID (not 'bbzchat').
        // BBZ Chat credential injection is handled in the 'schulcloud' case above,
        // which detects the URL containing 'chat.bbz-rd-eck.com' and uses the
        // direct API login approach (POST /api/login).
      }

      // IMPORTANT: For schulcloud, DON'T set credsAreSet to true automatically.
      // schulcloud has a multi-step login (email -> password -> encryption) and we need
      // the periodic check to keep triggering until fully logged in.
      // Only set credsAreSet for other apps that complete login in one shot.
      if (id !== 'schulcloud') {
        credsAreSet.current[id] = true;
      }
    } catch (error) {
      console.error(`Error injecting credentials for ${id}:`, error);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for system resume events — reload webviews with special handling per app
  useEffect(() => {
    if (!window.electron || !window.electron.onSystemResumed) {
      return;
    }

    const handleSystemResume = () => {
      console.log('[System Resume] Handling webview reloads');

      // Reset all credsAreSet so periodic checks can re-authenticate if needed
      Object.keys(credsAreSet.current).forEach(id => {
        credsAreSet.current[id] = false;
      });

      // Reload dropdown app webviews
      Object.keys(webviewRefs.current).forEach(id => {
        const webview = webviewRefs.current[id]?.current;
        if (!webview) return;
        try {
          console.log('[System Resume] webview', id + ': reloading');
          webview.reload();
        } catch (error) {
          console.warn('[System Resume] Error reloading webview', id, error);
        }
      });

      // Reload WCV apps with special handling
      for (const id of WCV_APPS) {
        try {
          if (id === 'outlook') {
            console.log('[System Resume] WCV outlook: forcing complete reload');
            window.electron.view.clearHistory(id)
              .then(() => window.electron.view.navigate(id, 'https://exchange.bbz-rd-eck.de/owa/'))
              .catch(() => window.electron.view.navigate(id, 'https://exchange.bbz-rd-eck.de/owa/'));
          } else if (id === 'webuntis') {
            window.electron.view.executeJavaScript(id, `(function() {
              const authLabel = document.querySelector('.un-input-group__label');
              return authLabel?.textContent === 'Bestätigungscode';
            })()`).then(isAuthPage => {
              if (isAuthPage) {
                console.log('[System Resume] WCV webuntis: skipping (auth page active)');
              } else {
                console.log('[System Resume] WCV webuntis: reloading');
                window.electron.view.reload(id);
              }
            }).catch(() => window.electron.view.reload(id));
          } else {
            console.log('[System Resume] WCV', id + ': reloading');
            window.electron.view.reload(id);
          }
        } catch (error) {
          console.warn('[System Resume] Error reloading WCV', id, error);
        }
      }
    };

    try {
      const unsubscribe = window.electron.onSystemResumed(handleSystemResume);
      return () => unsubscribe();
    } catch (error) {
      console.warn('Error setting up system resume listener:', error);
    }
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
    // Cleanup old dynamic webview refs when switching apps
    if (activeWebView && !Object.keys(standardApps).includes(activeWebView.id.toLowerCase())) {
      Object.keys(webviewRefs.current).forEach(id => {
        if (!Object.keys(standardApps).includes(id.toLowerCase()) && id !== activeWebView.id) {
          delete webviewRefs.current[id];
        }
      });
    }
  }, [standardApps, activeWebView]);

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

  // Set up SchulCloud / BBZ Chat notification checking.
  // For BBZ Chat (useBbzChat=true): ViewManager already detects the "(N) BBZ Chat"
  //   title pattern and sends view:badge-update → forwarded to update-badge above.
  //   No renderer polling needed.
  // For schul.cloud (useBbzChat=false): favicon red-dot pixel analysis every 8s.
  useEffect(() => {
    const isBbzChat = settings.useBbzChat;

    if (notificationCheckIntervalRef.current) {
      clearInterval(notificationCheckIntervalRef.current);
    }

    if (isBbzChat) {
      // BBZ Chat badge is handled by ViewManager → onBadgeUpdate useEffect above.
      return;
    }

    // schul.cloud: favicon pixel analysis via WCV
    const checkNotifications = async () => {
      try {
        const faviconData = await window.electron.view.executeJavaScript('schulcloud',
          `document.querySelector('link[rel="icon"][type="image/png"]')?.href`
        );
        if (!faviconData) return;
        const hasNotification = await checkForNotifications(faviconData);
        window.electron.send('update-badge', hasNotification ? 1 : 0);
      } catch (_) {}
    };

    notificationCheckIntervalRef.current = setInterval(checkNotifications, 8000);
    checkNotifications();

    // Restart interval on each WCV page load
    const unsubWcvEvent = window.electron.view.onEvent((event) => {
      if (event.appId === 'schulcloud' && event.type === 'dom-ready') {
        clearInterval(notificationCheckIntervalRef.current);
        notificationCheckIntervalRef.current = setInterval(checkNotifications, 8000);
        checkNotifications();
      }
    });

    return () => {
      unsubWcvEvent();
      if (notificationCheckIntervalRef.current) clearInterval(notificationCheckIntervalRef.current);
    };
  }, [settings.useBbzChat]); // Re-run when switching between BBZ Chat and schul.cloud

  // Event listener setup for dropdown (custom) app webviews only.
  // All standard apps are handled via WebContentsView.
  useEffect(() => {
    const eventCleanups = new Map();

    const addWebviewListener = (webview, event, handler) => {
      webview.addEventListener(event, handler);
      const cleanups = eventCleanups.get(webview) || [];
      cleanups.push(() => webview.removeEventListener(event, handler));
      eventCleanups.set(webview, cleanups);
    };

    const setupWebviewListeners = (webview) => {
      const id = webview.id.replace('wv-', '').toLowerCase();

      addWebviewListener(webview, 'did-start-loading', () => {
        setIsLoading(prev => ({ ...prev, [id]: true }));
      });

      addWebviewListener(webview, 'did-stop-loading', () => {
        setIsLoading(prev => ({ ...prev, [id]: false }));
      });

      addWebviewListener(webview, 'dom-ready', async () => {
        if (activeWebView && activeWebView.id === id) {
          onNavigate(webview.getURL());
        }
        setTimeout(async () => {
          await applyZoom(webview, id);
        }, 1000);
        await injectCredentials(webview, id);
      });

      let errorTimeouts = {};
      addWebviewListener(webview, 'did-fail-load', (error) => {
        setIsLoading(prev => ({ ...prev, [id]: false }));
        if (!isStartupPeriod && error.errorCode < -3) {
          if (errorTimeouts[id]) clearTimeout(errorTimeouts[id]);
          errorTimeouts[id] = setTimeout(async () => {
            try {
              webview.reload();
              await new Promise(resolve => setTimeout(resolve, 5000));
              const isWorking = await webview.executeJavaScript('true').catch(() => false);
              if (!isWorking) {
                const errorMessage = getErrorMessage(error);
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
                          handleRetryWebview(id);
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
            } catch (e) {
              console.error('Error in retry mechanism:', e);
            }
          }, 3000);
        }
        return () => {
          Object.values(errorTimeouts).forEach(timeout => clearTimeout(timeout));
        };
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
  }, [activeWebView, applyZoom, injectCredentials, onNavigate, toast, isStartupPeriod, standardApps]);

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

  // Helper to check if an app is from the dropdown (not in standardApps)
  const isDropdownApp = (id) => {
    return !Object.keys(standardApps).includes(id.toLowerCase());
  };

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
      {/* Preloaded Views for Navigation Apps */}
      {Object.entries(standardApps).map(([id, config]) => {
        if (!config.visible) return null;
        const isActive = activeWebView?.id === id;

        // WCV apps: render an anchor <div> whose bounds are reported to main
        if (WCV_APPS.has(id)) {
          return (
            <Box
              key={id}
              ref={(el) => { wcvAnchorRefs.current[id] = el; }}
              position="absolute"
              top="0"
              left="0"
              right="0"
              bottom="0"
              // Keep in DOM so bounds are observable; pointer-events stay off
              // because the WebContentsView (composited above) receives real input.
              visibility={isActive ? 'visible' : 'hidden'}
              pointerEvents="none"
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
            </Box>
          );
        }

        return null;
      })}

      {/* Dynamic Webview for Dropdown Apps */}
      {activeWebView && isDropdownApp(activeWebView.id) && (
        <Box
          position="absolute"
          top="0"
          left="0"
          right="0"
          bottom="0"
          display="block"
          visibility="visible"
          zIndex={1}
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
            ref={(el) => {
              if (el) {
                webviewRefs.current[activeWebView.id] = { current: el };
              }
            }}
            id={`wv-${activeWebView.id}`}
            src={activeWebView.url}
            preload={`${window.location.origin}/webview-preload.js`}
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
            }}
            allowpopups="true"
            partition="persist:main"
            webpreferences="nativeWindowOpen=yes,javascript=yes,plugins=yes,contextIsolation=no,devTools=yes"
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          />
        </Box>
      )}
    </Box>
  );
});

WebViewContainer.displayName = 'WebViewContainer';

export default WebViewContainer;