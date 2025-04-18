import React, { useCallback, forwardRef } from 'react';
import { useSchoolCustomization } from './SchoolCustomization';

const LoginSystemWrapper = forwardRef(function LoginSystemWrapper({ webview, webviewId, credentials, onLoginComplete }, ref) {
  const { loginSystems } = useSchoolCustomization();
  
  const injectCredentials = useCallback(async () => {
    if (!webview || !loginSystems[webviewId] || !loginSystems[webviewId].enabled) {
      return false;
    }
    
    const loginConfig = loginSystems[webviewId];
    const { email, password, bbbPassword, webuntisEmail, webuntisPassword } = credentials;
    
    // Helper function for delays
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    try {
      // Handle different login systems based on configuration
      switch (webviewId) {
        case 'webuntis':
          if (loginConfig.useSpecialCredentials && webuntisEmail && webuntisPassword) {
            // WebUntis specific login logic with React component handling
            await webview.executeJavaScript(`
              (async () => {
                try {
                  // Wait for form to be ready
                  await new Promise((resolve) => {
                    const checkForm = () => {
                      const form = document.querySelector('.un2-login-form form');
                      if (form) {
                        resolve();
                      } else {
                        setTimeout(checkForm, 100);
                      }
                    };
                    checkForm();
                  });

                  // Get form elements
                  const form = document.querySelector('.un2-login-form form');
                  const usernameField = form.querySelector('input[type="text"].un-input-group__input');
                  const passwordField = form.querySelector('input[type="password"].un-input-group__input');
                  const submitButton = form.querySelector('button[type="submit"]');

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

                    // Wait 2 seconds then check for authenticator page
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Only reload if we're not on the authenticator page
                    const authLabel = document.querySelector('.un-input-group__label');
                    if (authLabel?.textContent !== 'Bestätigungscode') {
                      window.location.reload();
                    }
                    return true;
                  }

                  return false;
                } catch (error) {
                  return false;
                }
              })();
            `);
            
            if (onLoginComplete) {
              onLoginComplete(webviewId, true);
            }
            return true;
          }
          return false;
          
        case 'handbook':
          // Check if login form exists and wait for it if necessary
          const formExists = await webview.executeJavaScript(`
            (async () => {
              // Wait for form elements to be ready (max 5 seconds)
              for (let i = 0; i < ${loginConfig.waitForFormTimeout / 100}; i++) {
                const userInput = document.querySelector('${loginConfig.loginSelector}');
                const passwordInput = document.querySelector('${loginConfig.passwordSelector}');
                const submitButton = document.querySelector('${loginConfig.submitSelector}');
                
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
              `document.querySelector('${loginConfig.loginSelector}').value = "${email}"; void(0);`
            );
            await webview.executeJavaScript(
              `document.querySelector('${loginConfig.passwordSelector}').value = "${password}"; void(0);`
            );
            await webview.executeJavaScript(
              `document.querySelector('${loginConfig.submitSelector}').click();`
            );
            
            if (loginConfig.reloadAfterLogin) {
              await sleep(loginConfig.reloadDelay || 5000);
              webview.reload();
            }
            
            if (onLoginComplete) {
              onLoginComplete(webviewId, true);
            }
            return true;
          }
          return false;
          
        default:
          // Generic login system for most platforms
          if (loginConfig.loginSelector && loginConfig.passwordSelector && loginConfig.submitSelector) {
            const loginValue = loginConfig.useLowerCase ? email.toLowerCase() : email;
            const passwordValue = loginConfig.useSpecialPassword ? bbbPassword : password;
            
            // Fill username/email
            await webview.executeJavaScript(
              `document.querySelector('${loginConfig.loginSelector}').value = "${loginValue}"; void(0);`
            );
            
            // Fill password
            await webview.executeJavaScript(
              `document.querySelector('${loginConfig.passwordSelector}').value = "${passwordValue}"; void(0);`
            );
            
            // Submit form
            await webview.executeJavaScript(
              `document.querySelector('${loginConfig.submitSelector}').click();`
            );
            
            // Handle post-login actions
            if (loginConfig.reloadAfterLogin) {
              await sleep(loginConfig.reloadDelay || 0);
              webview.reload();
            }
            
            if (onLoginComplete) {
              onLoginComplete(webviewId, true);
            }
            return true;
          }
          return false;
      }
    } catch (error) {
      console.error(`Error in login system for ${webviewId}:`, error);
      if (onLoginComplete) {
        onLoginComplete(webviewId, false, error);
      }
      return false;
    }
  }, [webview, webviewId, credentials, loginSystems, onLoginComplete]);
  
  // Expose the injectCredentials method through the ref
  React.useImperativeHandle(
    ref,
    () => ({
      injectCredentials
    }),
    [injectCredentials]
  );
  
  return null; // This is a logic component, not a UI component
});

export default LoginSystemWrapper;
