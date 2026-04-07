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
  Button,
} from '@chakra-ui/react';
import { useSettings } from '../context/SettingsContext';

const WebViewContainer = forwardRef(({ activeWebView, onNavigate, standardApps }, ref) => {
  const [preloadPath, setPreloadPath] = useState('');

  // Get the correct preload script path from main process
  useEffect(() => {
    const getPreloadPath = async () => {
      try {
        if (window.electron && window.electron.getWebviewPreloadPath) {
          const path = await window.electron.getWebviewPreloadPath();
          setPreloadPath(path);
          console.log('[WebViewContainer] Got preload path:', path);
        }
      } catch (error) {
        console.warn('Error getting webview preload path:', error);
      }
    };
    getPreloadPath();
  }, []);

  // Expose navigation methods through ref
  React.useImperativeHandle(ref, () => ({
    goBack: () => {
      if (!activeWebView) return;
      
      const webview = webviewRefs.current[activeWebView.id]?.current ||
        document.querySelector(`#wv-${activeWebView.id}`);
      
      if (webview && webview.src && webview.getWebContentsId) {
        try {
          // Check if webview is ready and can go back
          if (typeof webview.canGoBack === 'function' && webview.canGoBack()) {
            webview.goBack();
          }
        } catch (error) {
          console.warn('Error navigating back:', error);
        }
      }
    },
    goForward: () => {
      if (!activeWebView) return;
      
      const webview = webviewRefs.current[activeWebView.id]?.current ||
        document.querySelector(`#wv-${activeWebView.id}`);
      
      if (webview && webview.src && webview.getWebContentsId) {
        try {
          // Check if webview is ready and can go forward
          if (typeof webview.canGoForward === 'function' && webview.canGoForward()) {
            webview.goForward();
          }
        } catch (error) {
          console.warn('Error navigating forward:', error);
        }
      }
    },
    reload: () => {
      if (!activeWebView) return;
      
      const webview = webviewRefs.current[activeWebView.id]?.current ||
        document.querySelector(`#wv-${activeWebView.id}`);
      
      if (webview && webview.src) {
        try {
          // Check if webview is ready before reloading
          if (typeof webview.reload === 'function') {
            webview.reload();
          }
        } catch (error) {
          console.warn('Error reloading webview:', error);
        }
      }
    },
    print: () => {
      if (!activeWebView) return;
      
      const webview = webviewRefs.current[activeWebView.id]?.current ||
        document.querySelector(`#wv-${activeWebView.id}`);
      
      if (webview && webview.src && webview.getWebContentsId) {
        try {
          // Check if webview is ready before printing
          if (typeof webview.print === 'function') {
            webview.print();
          }
        } catch (error) {
          console.warn('Error printing webview:', error);
        }
      }
    }
  }));
  const webviewRefs = useRef({});
  const [isLoading, setIsLoading] = useState({});
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [overviewImagePath, setOverviewImagePath] = useState('');
  const [imageError, setImageError] = useState(false);
  // Use a ref (not state) so reads inside useCallback closures always see the latest value
  // immediately — React state batching would cause stale reads otherwise.
  const credsAreSet = useRef({});
  const [isStartupPeriod, setIsStartupPeriod] = useState(true);
  const [failedWebviews, setFailedWebviews] = useState({}); // eslint-disable-line no-unused-vars
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
      setFailedWebviews(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
    }
  };
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

      // Check login attempt limit (except for Outlook and WebUntis)
      if (id !== 'outlook' && id !== 'webuntis') {
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
          }
          break;

        case 'schulcloud':
          try {
            // Get encryption password for schul.cloud / BBZ Chat
            const schulcloudEncryptionResult = await window.electron.getCredentials({
              service: 'bbzcloud',
              account: 'schulcloudEncryptionPassword'
            });
            const schulcloudEncryptionPassword = schulcloudEncryptionResult.success ? schulcloudEncryptionResult.password : null;

            // Check if we're on BBZ Chat (chat.bbz-rd-eck.com)
            const currentUrl = webview.getURL();
            const isBbzChat = currentUrl.includes('chat.bbz-rd-eck.com');

            // If BBZ Chat, bypass the React login form entirely by calling
            // the API directly. This avoids all React internals / controlled input issues.
            // stashcat-chat's POST /api/login returns {token, user}, and the app
            // reads the token from localStorage('schulchat_token') on startup.
            if (isBbzChat) {
              const loginResult = await webview.executeJavaScript(`
                (async function() {
                  try {
                    // Check if already logged in (token exists and is valid)
                    const existingToken = localStorage.getItem('schulchat_token');
                    if (existingToken) {
                      console.log('[BBZ Chat] Token already exists, skipping login');
                      return 'ALREADY_LOGGED_IN';
                    }

                    console.log('[BBZ Chat] Calling /api/login directly...');
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
            // Detect login state using exact schul.cloud selectors
            const loginState = await webview.executeJavaScript(`
              (function() {
                // Look for specific schul.cloud elements
                const emailInput = document.querySelector('input#username[type="text"]');
                const passwordInputs = document.querySelectorAll('input[type="password"]');
                const weiterButton = document.querySelector('button[type="submit"].btn.btn-contained');
                const loginButton = Array.from(document.querySelectorAll('span.header')).find(el => el.textContent.includes('Anmelden mit Passwort')) ||
                                  Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Anmelden mit Passwort')) ||
                                  document.querySelector('[title*="Anmelden"]');
                
                // Check for remember login checkbox (look for the SVG icon structure)
                const rememberCheckbox = document.querySelector('app-icon[icon="check"]');
                
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
                const loggedIn = document.querySelector('.user-menu') ||
                               document.querySelector('.dashboard') ||
                               document.querySelector('.main-content') ||
                               document.body.textContent.includes('Abmelden');
                const onEncryptionPage = document.body.textContent.includes('Verschlüsselungspasswort') || document.body.textContent.includes('Smartphone');
                
                return {
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
                  title: document.title
                };
              })()
            `);

            console.log('schul.cloud login state:', loginState);

            if (loginState.loggedIn) {
              // Already logged in or on post-login page, no action needed
              return;
            }

            if (loginState.emailInput && !loginState.passwordInputs) {
              // Email page - fill email and click Weiter
              const result = await webview.executeJavaScript(`
                (function() {
                  const emailInput = document.querySelector('input#username[type="text"]');
                  const weiterButton = document.querySelector('button[type="submit"].btn.btn-contained');
                  
                  if (emailInput && weiterButton) {
                    console.log('Filling email:', "${emailAddress}");
                    emailInput.value = "${emailAddress}";
                    emailInput.focus();
                    
                    // Trigger Angular events
                    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                    emailInput.dispatchEvent(new Event('change', { bubbles: true }));
                    emailInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    // Wait then click Weiter button
                    setTimeout(() => {
                      console.log('Clicking Weiter button');
                      weiterButton.click();
                    }, 1000);
                    
                    return true;
                  }
                  return false;
                })()
              `);
              
              console.log('Email injection result:', result);
              
            } else if (loginState.passwordInputs && !loginState.onEncryptionPage) {
              // Password page - fill password, check remember me, and submit
              const result = await webview.executeJavaScript(`
                (function() {
                  // Find password input but exclude encryption password field
                  const allPasswordInputs = document.querySelectorAll('input[type="password"]');
                  let passwordInput = null;
                  
                  // Filter out encryption password field
                  for (const input of allPasswordInputs) {
                    const parentAppLabel = input.closest('app-label-input');
                    const hasEncryptionTestId = parentAppLabel && parentAppLabel.getAttribute('data-test-id') === 'set-private-key-password_pass_if';
                    const hasEncryptionLabel = parentAppLabel && parentAppLabel.textContent.includes('Verschlüsselungskennwort');
                    
                    // Skip if this is the encryption password field
                    if (hasEncryptionTestId || hasEncryptionLabel) {
                      console.log('Skipping encryption password field');
                      continue;
                    }
                    
                    // This should be the regular login password
                    passwordInput = input;
                    break;
                  }
                  
                  const rememberCheckbox = document.querySelector('app-icon[icon="check"]');
                  const loginButton = Array.from(document.querySelectorAll('span.header')).find(el => el.textContent.includes('Anmelden mit Passwort')) ||
                                    Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Anmelden mit Passwort'));
                  
                  if (passwordInput) {
                    console.log('Filling login password (not encryption password)');
                    passwordInput.value = ${JSON.stringify(password)};
                    passwordInput.focus();
                    
                    // Trigger Angular events
                    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
                    passwordInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    // Click remember login checkbox if available
                    if (rememberCheckbox) {
                      console.log('Clicking remember login checkbox');
                      rememberCheckbox.click();
                    }
                    
                    // Wait then click login button
                    setTimeout(() => {
                      if (loginButton) {
                        console.log('Clicking login button');
                        loginButton.click();
                      } else {
                        // Try to find the parent button element
                        const parentButton = document.querySelector('button[type="submit"]');
                        if (parentButton) {
                          console.log('Clicking parent login button');
                          parentButton.click();
                        }
                      }
                    }, 1000);
                    
                    return true;
                  } else {
                    console.log('No valid login password field found (encryption password excluded)');
                    return false;
                  }
                })()
              `);
              
              console.log('Password injection result:', result);
              
            } else if (loginState.onEncryptionPage && schulcloudEncryptionPassword) {
              // Encryption password page - need to click "Durch dein Verschlüsselungskennwort" first, then fill password
              const pageState = await webview.executeJavaScript(`
                (function() {
                  // Check for "Durch dein Verschlüsselungskennwort" button (with data-icon="password")
                  const encryptionButton = Array.from(document.querySelectorAll('button.row, div.row')).find(btn => 
                    btn.textContent.includes('Durch dein Verschlüsselungskennwort')
                  );
                  
                  const passwordInputs = document.querySelectorAll('input[type="password"]');
                  const weiterButton = Array.from(document.querySelectorAll('button')).find(btn => 
                    btn.textContent.includes('Weiter')
                  );
                  
                  return {
                    hasEncryptionButton: !!encryptionButton,
                    passwordInputCount: passwordInputs.length,
                    hasWeiterButton: !!weiterButton,
                    // Check if password field is already visible (after clicking encryption button)
                    passwordInputVisible: passwordInputs.length > 0 && passwordInputs[0].offsetParent !== null
                  };
                })()
              `);

              console.log('schul.cloud encryption page state:', pageState);

              // Wait a bit for the page to settle
              await new Promise(resolve => setTimeout(resolve, 500));

              // Check if we need to click the encryption button first
              if (pageState.hasEncryptionButton) {
                // Click "Durch dein Verschlüsselungskennwort" button
                await webview.executeJavaScript(`
                  (function() {
                    const encryptionButton = Array.from(document.querySelectorAll('button.row, div.row')).find(btn => 
                      btn.textContent.includes('Durch dein Verschlüsselungskennwort')
                    );
                    if (encryptionButton) {
                      console.log('Clicking Durch dein Verschlüsselungskennwort button');
                      encryptionButton.click();
                      return true;
                    }
                    return false;
                  })()
                `);

                // Wait for password field to appear
                await new Promise(resolve => setTimeout(resolve, 1500));
              }

              // Now fill encryption password and click Weiter
              const result = await webview.executeJavaScript(`
                (function() {
                  const passwordInputs = document.querySelectorAll('input[type="password"]');
                  const weiterButton = Array.from(document.querySelectorAll('button')).find(btn => 
                    btn.textContent.includes('Weiter')
                  );

                  // Find the visible password input
                  let encryptionInput = null;
                  for (const input of passwordInputs) {
                    if (input.offsetParent !== null) {
                      encryptionInput = input;
                      break;
                    }
                  }

                  if (!encryptionInput && passwordInputs.length > 0) {
                    encryptionInput = passwordInputs[0];
                  }
                  
                  if (encryptionInput && ${JSON.stringify(schulcloudEncryptionPassword)}) {
                    console.log('Filling encryption password:', ${JSON.stringify(schulcloudEncryptionPassword)});
                    encryptionInput.value = ${JSON.stringify(schulcloudEncryptionPassword)};
                    encryptionInput.focus();
                    
                    // Trigger Angular events
                    encryptionInput.dispatchEvent(new Event('input', { bubbles: true }));
                    encryptionInput.dispatchEvent(new Event('change', { bubbles: true }));
                    encryptionInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    // Wait then click Weiter button
                    setTimeout(() => {
                      if (weiterButton) {
                        console.log('Clicking Weiter button');
                        weiterButton.click();
                      }
                    }, 1000);
                    
                    return true;
                  } else {
                    console.log('No encryption password field found or no password set');
                    return false;
                  }
                })()
              `);
              
              console.log('Encryption password injection result:', result);
            }
          } catch (error) {
            console.error('Error during schul.cloud login:', error);
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
                    console.log('Filling Office email:', "${emailAddress}");
                    emailInput.value = "${emailAddress}";
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
                    passwordInput.value = "${password}";
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
              await webview.executeJavaScript(`
                (function() {
                  const adfsButton = document.querySelector('a[href*="user_saml/saml/login"]') ||
                                     Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'BBZ ADFS');
                  if (adfsButton) {
                    console.log('Clicking Nextcloud BBZ ADFS button, href:', adfsButton.href);
                    // .click() on anchor elements doesn't reliably trigger navigation in Electron webviews
                    // Use direct navigation instead
                    if (adfsButton.href) {
                      window.location.href = adfsButton.href;
                    } else {
                      // Fallback: dispatch a real mouse event
                      adfsButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    }
                    return true;
                  }
                  return false;
                })()
              `);
            } else if (ncLoginState.userNameInput && ncLoginState.passwordInput && ncLoginState.submitButton) {
              // ADFS login form - fill credentials (same form as Outlook)
              await webview.executeJavaScript(
                `document.querySelector('#userNameInput').value = "${emailAddress}"; void(0);`
              );
              await webview.executeJavaScript(
                `document.querySelector('#passwordInput').value = "${password}"; void(0);`
              );
              await webview.executeJavaScript(
                `document.querySelector('#submitButton').click();`
              );
            } else if (ncLoginState.jaButton) {
              // "Stay signed in?" page - click Ja
              await webview.executeJavaScript(`
                (function() {
                  const jaButton = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');
                  if (jaButton) {
                    setTimeout(() => jaButton.click(), 500);
                    return true;
                  }
                  return false;
                })()
              `);
            }
          } catch (error) {
            console.error('Error during Nextcloud login:', error);
          }
          break;

        // NOTE: BBZ Chat uses the 'schulcloud' webview ID (not 'bbzchat').
        // BBZ Chat credential injection is handled in the 'schulcloud' case above,
        // which detects the URL containing 'chat.bbz-rd-eck.com' and uses the
        // direct API login approach (POST /api/login).
      }

      credsAreSet.current[id] = true;
    } catch (error) {
      console.error(`Error injecting credentials for ${id}:`, error);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for webview messages
  useEffect(() => {
    if (!window.electron || !window.electron.onMessage) {
      return;
    }
    
    try {
      const messageHandler = (message) => {
        if (message.type === 'webuntis-needs-login') {
          const webview = document.querySelector('#wv-webuntis');
          if (webview) {
            credsAreSet.current["webuntis"] = false;
            injectCredentials(webview, 'webuntis');
          }
        }
      };

      const unsubscribe = window.electron.onMessage(messageHandler);

      return () => {
        if (unsubscribe && typeof unsubscribe === 'function') {
          unsubscribe();
        } else if (window.electron && window.electron.offMessage) {
          window.electron.offMessage(messageHandler);
        }
      };
    } catch (error) {
      console.warn('Error setting up message listener:', error);
    }
  }, [injectCredentials]);

  // Listen for system resume events
  useEffect(() => {
    if (!window.electron || !window.electron.onSystemResumed) {
      return;
    }
    
    try {
      const unsubscribe = window.electron.onSystemResumed((webviewsToReload) => {
        webviewsToReload.forEach(id => {
          const webview = webviewRefs.current[id]?.current;
          if (webview) {
            if (id === 'outlook') {
              // For Outlook, clear credentials state and force complete reload
              // Under macOS, we need to clear session data to prevent auth issues
              // Option A: Clear MSAL auth tokens for reliable re-login
              console.log('[System Resume] Clearing Outlook MSAL tokens and reloading');
              credsAreSet.current[id] = false;
              
              // Clear only OWA-specific auth tokens, not all storage
              webview.executeJavaScript(`
                // Clear OWA-specific auth items to force fresh login
                // These are the common OWA/Exchange auth token keys
                const owaKeys = [
                  'msal.token.keys',
                  'msal.account.keys',
                  'msal.idtoken',
                  'msal.accesstoken',
                  'msal.refreshtoken',
                  'msal.client.info',
                  'msal.error.description',
                  'msal.error',
                  'msal.token.renew.status',
                  'msal.interaction.status',
                  'msal.login.request',
                  'msal.authority',
                  'msal.nonce.idtoken',
                  'msal.state.login',
                  'msal.state.acquireToken'
                ];
                
                owaKeys.forEach(key => {
                  if (localStorage.getItem(key)) {
                    localStorage.removeItem(key);
                    console.log('[Outlook] Cleared auth key:', key);
                  }
                });
                
                // Also clear any cookies that might be expired
                document.cookie.split(';').forEach(cookie => {
                  const [name] = cookie.split('=');
                  if (name.trim().startsWith('msal.') || name.trim().includes('auth')) {
                    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                  }
                });
                
                console.log('[Outlook] Auth tokens cleared on system resume');
              `).then(() => {
                webview.clearHistory();
                // Small delay to ensure cleanup is complete
                setTimeout(() => {
                  // Force navigation to base OWA URL
                  webview.loadURL('https://exchange.bbz-rd-eck.de/owa/');
                }, 100);
              });
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
            } else if (id === 'office') {
              // For Office, clear credentials state and reload to prevent session loss
              console.log('[System Resume] Reloading Office webview');
              credsAreSet.current[id] = false;
              webview.reload();
            } else if (id === 'schulcloud') {
              // For BBZ Chat (schulcloud), clear token and credentials to force re-login
              console.log('[System Resume] Clearing BBZ Chat session');
              credsAreSet.current[id] = false;
              // Clear the token from localStorage to force re-login
              webview.executeJavaScript(`
                localStorage.removeItem('schulchat_token');
                console.log('[BBZ Chat] Token cleared on system resume');
              `).then(() => {
                webview.reload();
              });
            } else {
              webview.reload();
            }
          }
        });
      });
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
    // Initialize webviews for all standard apps
    Object.entries(standardApps).forEach(([id, config]) => {
      if (config.visible && !webviewRefs.current[id]) {
        webviewRefs.current[id] = React.createRef();
      }
    });

    // Cleanup old dynamic webview refs when switching apps
    if (activeWebView && isDropdownApp(activeWebView.id)) {
      Object.keys(webviewRefs.current).forEach(id => {
        if (isDropdownApp(id) && id !== activeWebView.id) {
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

      addWebviewListener(webview, 'did-stop-loading', async () => {
        setIsLoading(prev => ({ ...prev, [id]: false }));

        // For WebUntis, check for login form after loading finishes
        if (id === 'webuntis') {
          const isLoginPage = await webview.executeJavaScript(`
            (function() {
              const form = document.querySelector('.un2-login-form form') || document.querySelector('form');
              const passwordInput = document.querySelector('input[type="password"]');
              const authLabel = document.querySelector('.un-input-group__label');
              return (form || passwordInput) && (!authLabel || authLabel.textContent !== 'Bestätigungscode');
            })()
          `);
          
          if (isLoginPage) {
            credsAreSet.current[id] = false;
            await injectCredentials(webview, id);
          }
        }
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
        
        // For WebUntis, check for login form initially and set up periodic check
        if (id === 'webuntis') {
          const checkLoginForm = async () => {
            const isLoginPage = await webview.executeJavaScript(`
              (function() {
                const form = document.querySelector('.un2-login-form form') || document.querySelector('form');
                const passwordInput = document.querySelector('input[type="password"]');
                const authLabel = document.querySelector('.un-input-group__label');
                return (form || passwordInput) && (!authLabel || authLabel.textContent !== 'Bestätigungscode');
              })()
            `);
            
            if (isLoginPage) {
              credsAreSet.current[id] = false;
              await injectCredentials(webview, id);
            }
          };

          // Initial check
          await checkLoginForm();
          
          // Set up periodic check
          const interval = setInterval(checkLoginForm, 2000);
          eventCleanups.get(webview)?.push(() => clearInterval(interval));
        } else if (id === 'schulcloud') {
          // For schul.cloud AND BBZ Chat (both use the 'schulcloud' webview ID).
          //
          // IMPORTANT: Call injectCredentials directly on dom-ready (like generic apps)
          // AND set up a periodic check as fallback. The useEffect cleanup can clear
          // the periodic interval, and since dom-ready won't fire again, the periodic
          // check alone is unreliable. The direct call ensures at least one attempt.
          await injectCredentials(webview, id);

          // Initial check for BBZ Chat specifically - check if we're on the login page
          // and need to trigger credential injection immediately
          const checkBbzChatInitial = async () => {
            try {
              const currentUrl = webview.getURL();
              const isBbzChat = currentUrl.includes('chat.bbz-rd-eck.com');
              if (!isBbzChat) return;

              const needsLogin = await webview.executeJavaScript(`
                (function() {
                  // BBZ Chat login indicators
                  const emailInput = document.querySelector('input[type="email"]');
                  const passwordInputs = document.querySelectorAll('input[type="password"]');
                  const submitButton = document.querySelector('button[type="submit"]');
                  
                  // Check if already logged in (token exists)
                  const token = localStorage.getItem('schulchat_token');
                  const loggedIn = document.querySelector('.app-sidebar') ||
                                  document.querySelector('.sidebar') ||
                                  document.querySelector('[data-qa="sidebar"]');
                  
                  // Need login if we see login form and are not logged in
                  return (emailInput || passwordInputs.length > 0 || submitButton) && !loggedIn && !token;
                })()
              `);
              
              if (needsLogin) {
                console.log('[BBZ Chat] Initial check: Login needed, triggering injection');
                credsAreSet.current[id] = false;
                await injectCredentials(webview, id);
              }
            } catch (error) {
              // Silent fail - page might not be ready
            }
          };
          
          // Run initial BBZ Chat check
          await checkBbzChatInitial();

          const checkSchulCloudLogin = async () => {
            try {
              const needsLogin = await webview.executeJavaScript(`
                (function() {
                  // schul.cloud login selectors
                  const schulcloudEmailInput = document.querySelector('input#username[type="text"]');

                  // BBZ Chat (stashcat-chat) login selectors
                  const bbzChatEmailInput = document.querySelector('input[type="email"]');

                  // Shared: password field present on both login pages
                  const passwordInput = document.querySelector('input[type="password"]');

                  // schul.cloud logged-in indicators
                  const loggedInSchulcloud = document.querySelector('.user-menu') ||
                                 document.querySelector('.dashboard') ||
                                 document.querySelector('.main-content') ||
                                 document.body.textContent.includes('Verschlüsselungspasswort') ||
                                 document.body.textContent.includes('Smartphone');

                  // BBZ Chat logged-in: no login form + token present
                  const bbzChatLoggedIn = !bbzChatEmailInput && !!localStorage.getItem('schulchat_token');

                  // Generic logged-in indicator (works for both)
                  const loggedInGeneric = document.body.textContent.includes('Abmelden') ||
                                 document.body.textContent.includes('Logout');

                  const loggedIn = loggedInSchulcloud || bbzChatLoggedIn || loggedInGeneric;

                  return (schulcloudEmailInput || bbzChatEmailInput || passwordInput) && !loggedIn;
                })()
              `);

              if (needsLogin) {
                console.log('schul.cloud/BBZ Chat periodic check: Login needed, triggering injection');
                credsAreSet.current[id] = false;
                await injectCredentials(webview, id);
              }
            } catch (error) {
              // Silent fail - page might not be ready
            }
          };

          // Set up periodic check every 5 seconds as fallback
          const interval = setInterval(checkSchulCloudLogin, 5000);
          eventCleanups.get(webview)?.push(() => clearInterval(interval));
        } else if (id === 'office') {
          // For Office, check for Microsoft login forms periodically
          const checkOfficeLogin = async () => {
            try {
              const needsLogin = await webview.executeJavaScript(`
                (function() {
                  // Check for specific Office.com elements using exact selectors
                  const emailInput = document.querySelector('input[name="loginfmt"]#i0116[type="email"]');
                  const passwordInput = document.querySelector('input[name="passwd"]#i0118[type="password"]');
                  const weiterButton = document.querySelector('input[type="submit"]#idSIButton9[value="Weiter"]');
                  const anmeldenButton = document.querySelector('input[type="submit"]#idSIButton9[value="Anmelden"]');
                  const jaButton = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');
                  const emailTile = document.querySelector('div[data-bind*="session.tileDisplayName"]');
                  
                  // Check if already logged in (look for Office apps or user menu)
                  const officeApps = document.querySelector('.o365cs-nav-appTitle, .ms-Nav, .od-TopBar, [data-automation-id="appLauncher"]') ||
                                   document.body.textContent.includes('Office') ||
                                   document.body.textContent.includes('Microsoft 365');
                  
                  // We need login if we see any login elements and not logged in
                  return (emailInput || passwordInput || weiterButton || anmeldenButton || jaButton || emailTile) && !officeApps;
                })()
              `);
              
              if (needsLogin) {
                credsAreSet.current[id] = false;
                await injectCredentials(webview, id);
              }
            } catch (error) {
              // Silent fail - page might not be ready
            }
          };

          // Initial check
          await checkOfficeLogin();

          // Set up periodic check every 5 seconds
          const interval = setInterval(checkOfficeLogin, 5000);
          eventCleanups.get(webview)?.push(() => clearInterval(interval));
        } else if (id === 'nextcloud') {
          // For Nextcloud, check periodically for BBZ ADFS button or ADFS login form
          const checkNextcloudLogin = async () => {
            try {
              const needsLogin = await webview.executeJavaScript(`
                (function() {
                  const adfsButton = document.querySelector('a[href*="user_saml/saml/login"]') ||
                                     Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'BBZ ADFS');
                  const userNameInput = document.querySelector('#userNameInput');
                  const passwordInput = document.querySelector('#passwordInput');
                  const jaButton = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');

                  const loggedIn = document.querySelector('#header') ||
                                   document.querySelector('.app-navigation') ||
                                   document.querySelector('#nextcloud') ||
                                   window.location.href.includes('/apps/');

                  return (adfsButton || userNameInput || passwordInput || jaButton) && !loggedIn;
                })()
              `);

              if (needsLogin) {
                credsAreSet.current[id] = false;
                await injectCredentials(webview, id);
              }
            } catch (error) {
              // Silent fail - page might not be ready
            }
          };

          // Initial check
          await checkNextcloudLogin();

          // Set up periodic check every 5 seconds
          const ncInterval = setInterval(checkNextcloudLogin, 5000);
          eventCleanups.get(webview)?.push(() => clearInterval(ncInterval));
        } else if (id === 'antraege') {
          // For Anträge, check for agorum login form periodically
          const checkAntraegeLogin = async () => {
            try {
              const needsLogin = await webview.executeJavaScript(`
                (function() {
                  // Check for agorum login form elements
                  const usernameField = document.querySelector('input[autocomplete="username"]');
                  const passwordField = document.querySelector('input[autocomplete="current-password"]');
                  const loginButton = Array.from(document.querySelectorAll('a.x-btn')).find(btn => 
                    btn.textContent.includes('Anmelden')
                  );
                  
                  // Check if already logged in (look for agorum workspace elements)
                  const loggedIn = document.querySelector('.x-workspace') ||
                                 document.querySelector('.x-desktop') ||
                                 document.body.textContent.includes('Abmelden');
                  
                  // We need login if we see login form and not logged in
                  return (usernameField && passwordField && loginButton) && !loggedIn;
                })()
              `);
              
              if (needsLogin) {
                console.log('Anträge periodic check: Login needed, triggering injection');
                credsAreSet.current[id] = false;
                await injectCredentials(webview, id);
              }
            } catch (error) {
              // Silent fail - page might not be ready
            }
          };

          // Initial check
          await checkAntraegeLogin();
          
          // Set up periodic check every 5 seconds
          const interval = setInterval(checkAntraegeLogin, 5000);
          eventCleanups.get(webview)?.push(() => clearInterval(interval));
        } else if (id === 'schulportal') {
          // For Schulportal, check for login form periodically
          const checkSchulportalLogin = async () => {
            try {
              const needsLogin = await webview.executeJavaScript(`
                (function() {
                  const usernameField = document.querySelector('input#username');
                  const passwordField = document.querySelector('input#password');
                  const submitButton = document.querySelector('input#kc-login[type="submit"]');
                  
                  // If fields exist, we probably need to login
                  return !!(usernameField && passwordField && submitButton);
                })()
              `);
              
              if (needsLogin) {
                credsAreSet.current[id] = false;
                await injectCredentials(webview, id);
              }
            } catch (error) {
              // Silent fail
            }
          };

          // Initial check
          await checkSchulportalLogin();
          
          // Set up periodic check every 5 seconds
          const interval = setInterval(checkSchulportalLogin, 5000);
          eventCleanups.get(webview)?.push(() => clearInterval(interval));
        } else {
          await injectCredentials(webview, id);
        }

        // Override CryptPad's popup detection for cryptpad URLs
        if (webview.getURL().includes('cryptpad')) {
          await webview.executeJavaScript(`
            // Override popup detection
            window.open = new Proxy(window.open, {
              apply: function(target, thisArg, args) {
                // Call original window.open
                const result = Reflect.apply(target, thisArg, args);
                // Force CryptPad to think popups are allowed
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

        // Context menu setup (only add once)
        if (
          webview.getURL().includes('schul.cloud') ||
          webview.getURL().includes('portal.bbz-rd-eck.com') ||
          webview.getURL().includes('taskcards.app') ||
          webview.getURL().includes('wiki.bbz-rd-eck.com')
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

      // Navigation handler with smarter session detection
      addWebviewListener(webview, 'did-navigate', async () => {
        // For WebUntis, check for login form after each navigation
        if (id === 'webuntis') {
          const isLoginPage = await webview.executeJavaScript(`
            (function() {
              const form = document.querySelector('.un2-login-form form') || document.querySelector('form');
              const passwordInput = document.querySelector('input[type="password"]');
              const authLabel = document.querySelector('.un-input-group__label');
              return (form || passwordInput) && (!authLabel || authLabel.textContent !== 'Bestätigungscode');
            })()
          `);
          
          if (isLoginPage) {
            credsAreSet.current[id] = false;
            await injectCredentials(webview, id);
          }
        } else if (id === 'schulcloud') {
          // For schul.cloud AND BBZ Chat (both use the 'schulcloud' webview ID),
          // check for login forms after navigation using selectors for both services
          try {
            const needsLogin = await webview.executeJavaScript(`
              (function() {
                // schul.cloud login selectors
                const schulcloudEmailInput = document.querySelector('input#username[type="text"]');

                // BBZ Chat login selectors (uses email input instead of text)
                const bbzChatEmailInput = document.querySelector('input[type="email"]');

                // Shared: password field present on both login pages
                const passwordInput = document.querySelector('input[type="password"]');

                // schul.cloud logged-in indicators
                const loggedInSchulcloud = document.querySelector('.user-menu') ||
                               document.querySelector('.dashboard') ||
                               document.querySelector('.main-content') ||
                               document.body.textContent.includes('Verschlüsselungspasswort') ||
                               document.body.textContent.includes('Smartphone');

                // BBZ Chat logged-in: no login form + token present
                const bbzChatLoggedIn = !bbzChatEmailInput && !!localStorage.getItem('schulchat_token');

                // Generic logged-in indicator (works for both)
                const loggedInGeneric = document.body.textContent.includes('Abmelden') ||
                               document.body.textContent.includes('Logout');

                const loggedIn = loggedInSchulcloud || bbzChatLoggedIn || loggedInGeneric;

                return (schulcloudEmailInput || bbzChatEmailInput || passwordInput) && !loggedIn;
              })()
            `);
            
            if (needsLogin) {
              credsAreSet.current[id] = false;
              await injectCredentials(webview, id);
            }
          } catch (error) {
            // Silent fail - page might not be ready
          }
        } else if (id === 'office') {
          // For Office, check for login forms after navigation
          try {
            const needsLogin = await webview.executeJavaScript(`
              (function() {
                const emailInput = document.querySelector('input[type="email"], input[placeholder*="E-Mail-Adresse"], input[placeholder*="Telefonnummer"]');
                const passwordInput = document.querySelector('input[type="password"]');
                const microsoftLogo = document.querySelector('img[alt*="Microsoft"], .ms-logo');
                
                const orgEmailInput = document.querySelector('input[type="email"], input[name="email"], input[id*="email"]');
                const orgPasswordInput = document.querySelector('input[type="password"], input[name="password"], input[id*="password"]');
                const orgLoginButton = document.querySelector('input[type="submit"], button[type="submit"]');
                
                const officeApps = document.querySelector('.o365cs-nav-appTitle, .ms-Nav, .od-TopBar, [data-automation-id="appLauncher"]');
                
                const hasMicrosoftLogin = (emailInput || passwordInput) && microsoftLogo;
                const hasOrgLogin = orgEmailInput && orgPasswordInput && orgLoginButton && !microsoftLogo;
                
                return (hasMicrosoftLogin || hasOrgLogin) && !officeApps;
              })()
            `);
            
            if (needsLogin) {
              credsAreSet.current[id] = false;
              await injectCredentials(webview, id);
            }
          } catch (error) {
            // Silent fail - page might not be ready
          }
        } else if (id === 'nextcloud') {
          // For Nextcloud, check for BBZ ADFS button or ADFS login form after navigation
          try {
            const needsLogin = await webview.executeJavaScript(`
              (function() {
                const adfsButton = document.querySelector('a[href*="user_saml/saml/login"]') ||
                                   Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'BBZ ADFS');
                const userNameInput = document.querySelector('#userNameInput');
                const passwordInput = document.querySelector('#passwordInput');
                const jaButton = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');

                const loggedIn = document.querySelector('#header') ||
                                 document.querySelector('.app-navigation') ||
                                 document.querySelector('#nextcloud') ||
                                 window.location.href.includes('/apps/');

                return (adfsButton || userNameInput || passwordInput || jaButton) && !loggedIn;
              })()
            `);

            if (needsLogin) {
              credsAreSet.current[id] = false;
              await injectCredentials(webview, id);
            }
          } catch (error) {
            // Silent fail - page might not be ready
          }
        }
      });

      // Error handler with retry mechanism
      let errorTimeouts = {};
      
      addWebviewListener(webview, 'did-fail-load', (error) => {
        setIsLoading(prev => ({ ...prev, [id]: false }));
        
        if (!isStartupPeriod && error.errorCode < -3) {
          // Clear any existing timeout for this webview
          if (errorTimeouts[id]) {
            clearTimeout(errorTimeouts[id]);
          }
          
          // Set a new timeout to check if the error persists
          errorTimeouts[id] = setTimeout(async () => {
            try {
              // Try to reload the webview
              webview.reload();
              
              // Wait 5 seconds to see if it loads successfully
              await new Promise(resolve => setTimeout(resolve, 5000));
              
              // Check if the webview is now working
              const isWorking = await webview.executeJavaScript('true').catch(() => false);
              
              if (!isWorking) {
                // If still not working, show the error message
                const errorMessage = getErrorMessage(error);
                setFailedWebviews(prev => ({
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
            } catch (error) {
              console.error('Error in retry mechanism:', error);
            }
          }, 3000); // Wait 3 seconds before attempting retry
        }
      });

      // Cleanup error timeouts
      return () => {
        Object.values(errorTimeouts).forEach(timeout => clearTimeout(timeout));
      };
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
      {/* Preloaded Webviews for Navigation Apps */}
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
              preload={preloadPath || undefined}
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
        );
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
              if (el && !webviewRefs.current[activeWebView.id]) {
                webviewRefs.current[activeWebView.id] = { current: el };
                // Set up event listeners for the dynamic webview
                const setupWebviewListeners = document.querySelectorAll('webview');
                setupWebviewListeners.forEach(webview => {
                  if (webview === el) {
                    const id = webview.id.replace('wv-', '').toLowerCase();
                    // Loading state handlers
                    webview.addEventListener('did-start-loading', () => {
                      setIsLoading(prev => ({ ...prev, [id]: true }));
                    });
                    webview.addEventListener('did-stop-loading', () => {
                      setIsLoading(prev => ({ ...prev, [id]: false }));
                    });
                    
                    // DOM Ready handler for credentials and zoom
                    webview.addEventListener('dom-ready', async () => {
                      // Apply zoom
                      await applyZoom(webview, id);
                      
                      // Attempt credential injection
                      await injectCredentials(webview, id);
                    });

                    // Apply zoom (fallback)
                    setTimeout(async () => {
                      await applyZoom(webview, id);
                    }, 1000);
                  }
                });
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