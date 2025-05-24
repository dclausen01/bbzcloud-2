import { useState, useEffect, useCallback } from 'react';
import { DATABASE_CONFIG, ERROR_MESSAGES } from '../utils/constants';

/**
 * Custom hook for managing credentials
 * @returns {Object} - Object with credential management functions and state
 */
export const useCredentials = () => {
  const [credentials, setCredentials] = useState({
    email: '',
    password: '',
    bbbPassword: '',
    webuntisEmail: '',
    webuntisPassword: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Load all credentials from keytar
   */
  const loadCredentials = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const [emailResult, passwordResult, bbbPasswordResult, webuntisEmailResult, webuntisPasswordResult] = await Promise.all([
        window.electron.getCredentials({
          service: DATABASE_CONFIG.SERVICE_NAME,
          account: DATABASE_CONFIG.ACCOUNTS.EMAIL
        }),
        window.electron.getCredentials({
          service: DATABASE_CONFIG.SERVICE_NAME,
          account: DATABASE_CONFIG.ACCOUNTS.PASSWORD
        }),
        window.electron.getCredentials({
          service: DATABASE_CONFIG.SERVICE_NAME,
          account: DATABASE_CONFIG.ACCOUNTS.BBB_PASSWORD
        }),
        window.electron.getCredentials({
          service: DATABASE_CONFIG.SERVICE_NAME,
          account: DATABASE_CONFIG.ACCOUNTS.WEBUNTIS_EMAIL
        }),
        window.electron.getCredentials({
          service: DATABASE_CONFIG.SERVICE_NAME,
          account: DATABASE_CONFIG.ACCOUNTS.WEBUNTIS_PASSWORD
        })
      ]);

      setCredentials({
        email: emailResult.success ? emailResult.password || '' : '',
        password: passwordResult.success ? passwordResult.password || '' : '',
        bbbPassword: bbbPasswordResult.success ? bbbPasswordResult.password || '' : '',
        webuntisEmail: webuntisEmailResult.success ? webuntisEmailResult.password || '' : '',
        webuntisPassword: webuntisPasswordResult.success ? webuntisPasswordResult.password || '' : '',
      });
    } catch (error) {
      console.error('Error loading credentials:', error);
      setError(ERROR_MESSAGES.CREDENTIALS_NOT_FOUND);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Save a single credential
   * @param {string} account - The account type (email, password, etc.)
   * @param {string} value - The credential value
   */
  const saveCredential = useCallback(async (account, value) => {
    try {
      const result = await window.electron.saveCredentials({
        service: DATABASE_CONFIG.SERVICE_NAME,
        account,
        password: value
      });

      if (result.success) {
        setCredentials(prev => ({
          ...prev,
          [account]: value
        }));
        return { success: true };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error(`Error saving credential ${account}:`, error);
      setError(error.message);
      return { success: false, error: error.message };
    }
  }, []);

  /**
   * Save multiple credentials at once
   * @param {Object} credentialsToSave - Object with credential key-value pairs
   */
  const saveCredentials = useCallback(async (credentialsToSave) => {
    try {
      const savePromises = Object.entries(credentialsToSave).map(([account, value]) => {
        if (value) { // Only save non-empty values
          return window.electron.saveCredentials({
            service: DATABASE_CONFIG.SERVICE_NAME,
            account,
            password: value
          });
        }
        return Promise.resolve({ success: true });
      });

      const results = await Promise.all(savePromises);
      const failedSaves = results.filter(result => !result.success);

      if (failedSaves.length === 0) {
        setCredentials(prev => ({
          ...prev,
          ...credentialsToSave
        }));
        return { success: true };
      } else {
        throw new Error('Some credentials failed to save');
      }
    } catch (error) {
      console.error('Error saving credentials:', error);
      setError(error.message);
      return { success: false, error: error.message };
    }
  }, []);

  /**
   * Get a specific credential
   * @param {string} account - The account type
   * @returns {string} - The credential value
   */
  const getCredential = useCallback((account) => {
    return credentials[account] || '';
  }, [credentials]);

  /**
   * Check if credentials are available for a specific service
   * @param {string} service - The service to check (e.g., 'webuntis', 'bbb')
   * @returns {boolean} - Whether credentials are available
   */
  const hasCredentialsFor = useCallback((service) => {
    switch (service.toLowerCase()) {
      case 'webuntis':
        return !!(credentials.webuntisEmail && credentials.webuntisPassword);
      case 'bbb':
      case 'bigbluebutton':
        return !!(credentials.email && credentials.bbbPassword);
      case 'outlook':
      case 'moodle':
      case 'handbook':
        return !!(credentials.email && credentials.password);
      default:
        return !!(credentials.email && credentials.password);
    }
  }, [credentials]);

  /**
   * Get credentials for a specific service
   * @param {string} service - The service name
   * @returns {Object} - Object with relevant credentials for the service
   */
  const getCredentialsFor = useCallback((service) => {
    switch (service.toLowerCase()) {
      case 'webuntis':
        return {
          email: credentials.webuntisEmail,
          password: credentials.webuntisPassword
        };
      case 'bbb':
      case 'bigbluebutton':
        return {
          email: credentials.email,
          password: credentials.bbbPassword
        };
      case 'outlook':
      case 'moodle':
      case 'handbook':
        return {
          email: credentials.email,
          password: credentials.password
        };
      default:
        return {
          email: credentials.email,
          password: credentials.password
        };
    }
  }, [credentials]);

  /**
   * Clear all credentials
   */
  const clearCredentials = useCallback(() => {
    setCredentials({
      email: '',
      password: '',
      bbbPassword: '',
      webuntisEmail: '',
      webuntisPassword: '',
    });
  }, []);

  /**
   * Check if user is a teacher based on email domain
   * @returns {boolean} - Whether the user is a teacher
   */
  const isTeacher = useCallback(() => {
    return credentials.email.endsWith('@bbz-rd-eck.de');
  }, [credentials.email]);

  /**
   * Check if user is a student based on email domain
   * @returns {boolean} - Whether the user is a student
   */
  const isStudent = useCallback(() => {
    return credentials.email.endsWith('@sus.bbz-rd-eck.de');
  }, [credentials.email]);

  /**
   * Get user type (teacher, student, or unknown)
   * @returns {string} - The user type
   */
  const getUserType = useCallback(() => {
    if (isTeacher()) return 'teacher';
    if (isStudent()) return 'student';
    return 'unknown';
  }, [isTeacher, isStudent]);

  /**
   * Validate email format
   * @param {string} email - The email to validate
   * @returns {boolean} - Whether the email is valid
   */
  const validateEmail = useCallback((email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }, []);

  /**
   * Validate BBZ email format
   * @param {string} email - The email to validate
   * @returns {boolean} - Whether the email is a valid BBZ email
   */
  const validateBBZEmail = useCallback((email) => {
    return email.endsWith('@bbz-rd-eck.de') || email.endsWith('@sus.bbz-rd-eck.de');
  }, []);

  // Load credentials on mount
  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  return {
    // State
    credentials,
    isLoading,
    error,
    
    // Actions
    loadCredentials,
    saveCredential,
    saveCredentials,
    clearCredentials,
    
    // Getters
    getCredential,
    getCredentialsFor,
    hasCredentialsFor,
    
    // User info
    isTeacher,
    isStudent,
    getUserType,
    
    // Validation
    validateEmail,
    validateBBZEmail,
    
    // Utilities
    setError,
  };
};

/**
 * Hook for managing credential injection state
 * @returns {Object} - Object with injection state management
 */
export const useCredentialInjection = () => {
  const [injectionState, setInjectionState] = useState({});

  const setCredentialsInjected = useCallback((serviceId, injected = true) => {
    setInjectionState(prev => ({
      ...prev,
      [serviceId]: injected
    }));
  }, []);

  const areCredentialsInjected = useCallback((serviceId) => {
    return injectionState[serviceId] || false;
  }, [injectionState]);

  const resetInjectionState = useCallback((serviceId) => {
    if (serviceId) {
      setInjectionState(prev => ({
        ...prev,
        [serviceId]: false
      }));
    } else {
      setInjectionState({});
    }
  }, []);

  return {
    injectionState,
    setCredentialsInjected,
    areCredentialsInjected,
    resetInjectionState,
  };
};

export default useCredentials;
