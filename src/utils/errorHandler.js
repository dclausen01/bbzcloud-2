/**
 * BBZCloud - Error Handling Utilities
 * 
 * This module provides centralized error handling and logging functionality
 * to improve application reliability and debugging capabilities.
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.0.39
 */

/**
 * Error severity levels
 */
export const ERROR_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Error categories for better organization
 */
export const ERROR_CATEGORIES = {
  KEYBOARD_SHORTCUTS: 'keyboard-shortcuts',
  WEBVIEW: 'webview',
  CREDENTIALS: 'credentials',
  DATABASE: 'database',
  UI: 'ui',
  NETWORK: 'network',
  ELECTRON: 'electron'
};

/**
 * Enhanced error logging with context
 * 
 * @param {Error|string} error - The error to log
 * @param {string} category - Error category
 * @param {string} level - Error severity level
 * @param {Object} context - Additional context information
 */
export const logError = (error, category = ERROR_CATEGORIES.UI, level = ERROR_LEVELS.MEDIUM, context = {}) => {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : error;
  const stack = error instanceof Error ? error.stack : null;
  
  const logEntry = {
    timestamp,
    category,
    level,
    message: errorMessage,
    stack,
    context,
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  // Log to console with appropriate level
  switch (level) {
    case ERROR_LEVELS.LOW:
      console.info('[BBZCloud]', logEntry);
      break;
    case ERROR_LEVELS.MEDIUM:
      console.warn('[BBZCloud]', logEntry);
      break;
    case ERROR_LEVELS.HIGH:
    case ERROR_LEVELS.CRITICAL:
      console.error('[BBZCloud]', logEntry);
      break;
    default:
      console.log('[BBZCloud]', logEntry);
  }

  // Send to Electron main process for persistent logging if available
  if (window.electron && window.electron.logError) {
    try {
      window.electron.logError(logEntry);
    } catch (electronError) {
      console.error('[BBZCloud] Failed to send error to main process:', electronError);
    }
  }

  return logEntry;
};

/**
 * Wrapper for async functions with error handling
 * 
 * @param {Function} fn - Async function to wrap
 * @param {string} category - Error category
 * @param {Object} context - Additional context
 * @returns {Function} - Wrapped function
 */
export const withErrorHandling = (fn, category = ERROR_CATEGORIES.UI, context = {}) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(error, category, ERROR_LEVELS.HIGH, {
        ...context,
        functionName: fn.name,
        arguments: args
      });
      throw error; // Re-throw to allow caller to handle
    }
  };
};

/**
 * Safe execution wrapper that doesn't throw
 * 
 * @param {Function} fn - Function to execute safely
 * @param {*} fallbackValue - Value to return on error
 * @param {string} category - Error category
 * @param {Object} context - Additional context
 * @returns {*} - Function result or fallback value
 */
export const safeExecute = async (fn, fallbackValue = null, category = ERROR_CATEGORIES.UI, context = {}) => {
  try {
    return await fn();
  } catch (error) {
    logError(error, category, ERROR_LEVELS.MEDIUM, {
      ...context,
      functionName: fn.name,
      fallbackValue
    });
    return fallbackValue;
  }
};

/**
 * Keyboard shortcut error handler
 * 
 * @param {Error} error - The error that occurred
 * @param {string} shortcut - The shortcut that failed
 * @param {Object} context - Additional context
 */
export const handleKeyboardShortcutError = (error, shortcut, context = {}) => {
  logError(error, ERROR_CATEGORIES.KEYBOARD_SHORTCUTS, ERROR_LEVELS.HIGH, {
    shortcut,
    ...context
  });
};

/**
 * WebView error handler
 * 
 * @param {Error} error - The error that occurred
 * @param {string} webviewId - ID of the webview
 * @param {string} url - URL that failed to load
 * @param {Object} context - Additional context
 */
export const handleWebViewError = (error, webviewId, url, context = {}) => {
  logError(error, ERROR_CATEGORIES.WEBVIEW, ERROR_LEVELS.HIGH, {
    webviewId,
    url,
    ...context
  });
};

/**
 * Credential error handler
 * 
 * @param {Error} error - The error that occurred
 * @param {string} operation - The operation that failed (get, save, delete)
 * @param {string} service - The service name
 * @param {string} account - The account name
 */
export const handleCredentialError = (error, operation, service, account) => {
  logError(error, ERROR_CATEGORIES.CREDENTIALS, ERROR_LEVELS.HIGH, {
    operation,
    service,
    account: account ? '[REDACTED]' : null // Don't log actual account names
  });
};

/**
 * Database error handler
 * 
 * @param {Error} error - The error that occurred
 * @param {string} operation - The operation that failed
 * @param {Object} context - Additional context
 */
export const handleDatabaseError = (error, operation, context = {}) => {
  logError(error, ERROR_CATEGORIES.DATABASE, ERROR_LEVELS.HIGH, {
    operation,
    ...context
  });
};

/**
 * Network error handler
 * 
 * @param {Error} error - The error that occurred
 * @param {string} url - The URL that failed
 * @param {Object} context - Additional context
 */
export const handleNetworkError = (error, url, context = {}) => {
  logError(error, ERROR_CATEGORIES.NETWORK, ERROR_LEVELS.MEDIUM, {
    url,
    ...context
  });
};

/**
 * Global error handler for unhandled errors
 */
export const setupGlobalErrorHandling = () => {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    logError(
      event.reason,
      ERROR_CATEGORIES.UI,
      ERROR_LEVELS.CRITICAL,
      {
        type: 'unhandledrejection',
        promise: event.promise
      }
    );
  });

  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    logError(
      event.error || event.message,
      ERROR_CATEGORIES.UI,
      ERROR_LEVELS.CRITICAL,
      {
        type: 'uncaught',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }
    );
  });

  // Handle React error boundary fallback
  window.addEventListener('react-error', (event) => {
    logError(
      event.detail.error,
      ERROR_CATEGORIES.UI,
      ERROR_LEVELS.CRITICAL,
      {
        type: 'react-error',
        componentStack: event.detail.componentStack
      }
    );
  });
};

/**
 * Performance monitoring utilities
 */
export const performanceMonitor = {
  /**
   * Mark the start of a performance measurement
   * @param {string} name - Name of the measurement
   */
  start: (name) => {
    if (performance && performance.mark) {
      performance.mark(`${name}-start`);
    }
  },

  /**
   * Mark the end of a performance measurement and log if slow
   * @param {string} name - Name of the measurement
   * @param {number} threshold - Threshold in milliseconds to log as slow
   */
  end: (name, threshold = 1000) => {
    if (performance && performance.mark && performance.measure) {
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);
      
      const measure = performance.getEntriesByName(name)[0];
      if (measure && measure.duration > threshold) {
        logError(
          `Slow operation detected: ${name} took ${measure.duration.toFixed(2)}ms`,
          ERROR_CATEGORIES.UI,
          ERROR_LEVELS.MEDIUM,
          {
            operation: name,
            duration: measure.duration,
            threshold
          }
        );
      }
    }
  }
};

export default {
  logError,
  withErrorHandling,
  safeExecute,
  handleKeyboardShortcutError,
  handleWebViewError,
  handleCredentialError,
  handleDatabaseError,
  handleNetworkError,
  setupGlobalErrorHandling,
  performanceMonitor,
  ERROR_LEVELS,
  ERROR_CATEGORIES
};
