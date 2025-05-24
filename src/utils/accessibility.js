import { ACCESSIBILITY } from './constants';

/**
 * Focus management utilities for accessibility
 */

// Store the last focused element before opening a modal/drawer
let lastFocusedElement = null;

/**
 * Trap focus within a container (for modals and drawers)
 * @param {HTMLElement} container - The container to trap focus within
 */
export const trapFocus = (container) => {
  if (!container) return;

  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  
  const firstFocusableElement = focusableElements[0];
  const lastFocusableElement = focusableElements[focusableElements.length - 1];

  const handleTabKey = (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstFocusableElement) {
        lastFocusableElement.focus();
        e.preventDefault();
      }
    } else {
      // Tab
      if (document.activeElement === lastFocusableElement) {
        firstFocusableElement.focus();
        e.preventDefault();
      }
    }
  };

  container.addEventListener('keydown', handleTabKey);
  
  // Focus the first element
  if (firstFocusableElement) {
    firstFocusableElement.focus();
  }

  // Return cleanup function
  return () => {
    container.removeEventListener('keydown', handleTabKey);
  };
};

/**
 * Save the currently focused element
 */
export const saveFocus = () => {
  lastFocusedElement = document.activeElement;
};

/**
 * Restore focus to the previously focused element
 */
export const restoreFocus = () => {
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
};

/**
 * Create a skip link for keyboard navigation
 * @param {string} targetId - The ID of the element to skip to
 * @param {string} text - The text for the skip link
 * @returns {HTMLElement} The skip link element
 */
export const createSkipLink = (targetId, text = 'Zum Hauptinhalt springen') => {
  const skipLink = document.createElement('a');
  skipLink.href = `#${targetId}`;
  skipLink.textContent = text;
  skipLink.className = 'skip-link';
  
  // Apply styles
  Object.assign(skipLink.style, ACCESSIBILITY.SKIP_LINK_STYLES);
  
  // Show on focus
  skipLink.addEventListener('focus', () => {
    skipLink.style.left = '8px';
    skipLink.style.top = '8px';
  });
  
  // Hide on blur
  skipLink.addEventListener('blur', () => {
    skipLink.style.left = '-9999px';
    skipLink.style.top = 'auto';
  });
  
  return skipLink;
};

/**
 * Add focus visible styles to an element
 * @param {HTMLElement} element - The element to add focus styles to
 */
export const addFocusStyles = (element) => {
  if (!element) return;
  
  element.style.outline = 'none'; // Remove default outline
  
  const handleFocus = () => {
    element.style.outline = ACCESSIBILITY.FOCUS_VISIBLE_OUTLINE;
    element.style.outlineOffset = ACCESSIBILITY.FOCUS_VISIBLE_OUTLINE_OFFSET;
  };
  
  const handleBlur = () => {
    element.style.outline = 'none';
    element.style.outlineOffset = '0';
  };
  
  element.addEventListener('focus', handleFocus);
  element.addEventListener('blur', handleBlur);
  
  // Return cleanup function
  return () => {
    element.removeEventListener('focus', handleFocus);
    element.removeEventListener('blur', handleBlur);
  };
};

/**
 * Announce text to screen readers
 * @param {string} message - The message to announce
 * @param {string} priority - The priority level ('polite' or 'assertive')
 */
export const announceToScreenReader = (message, priority = 'polite') => {
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.style.position = 'absolute';
  announcement.style.left = '-9999px';
  announcement.style.width = '1px';
  announcement.style.height = '1px';
  announcement.style.overflow = 'hidden';
  
  document.body.appendChild(announcement);
  announcement.textContent = message;
  
  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
};

/**
 * Check if an element is focusable
 * @param {HTMLElement} element - The element to check
 * @returns {boolean} Whether the element is focusable
 */
export const isFocusable = (element) => {
  if (!element) return false;
  
  const focusableSelectors = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ];
  
  return focusableSelectors.some(selector => element.matches(selector));
};

/**
 * Get all focusable elements within a container
 * @param {HTMLElement} container - The container to search within
 * @returns {NodeList} List of focusable elements
 */
export const getFocusableElements = (container) => {
  if (!container) return [];
  
  return container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
  );
};

/**
 * Handle arrow key navigation in a list
 * @param {Event} event - The keyboard event
 * @param {NodeList} items - The list items to navigate
 * @param {number} currentIndex - The current focused item index
 * @param {Function} onIndexChange - Callback when index changes
 */
export const handleArrowNavigation = (event, items, currentIndex, onIndexChange) => {
  if (!items || items.length === 0) return;
  
  let newIndex = currentIndex;
  
  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowRight':
      newIndex = (currentIndex + 1) % items.length;
      event.preventDefault();
      break;
    case 'ArrowUp':
    case 'ArrowLeft':
      newIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1;
      event.preventDefault();
      break;
    case 'Home':
      newIndex = 0;
      event.preventDefault();
      break;
    case 'End':
      newIndex = items.length - 1;
      event.preventDefault();
      break;
    default:
      return;
  }
  
  if (newIndex !== currentIndex) {
    items[newIndex].focus();
    onIndexChange(newIndex);
  }
};

/**
 * Create an accessible button with proper ARIA attributes
 * @param {Object} options - Button configuration
 * @returns {Object} Button props for React component
 */
export const createAccessibleButton = ({
  label,
  description,
  pressed,
  expanded,
  controls,
  disabled = false
}) => {
  const props = {
    'aria-label': label,
    'aria-disabled': disabled,
  };
  
  if (description) {
    props['aria-describedby'] = description;
  }
  
  if (typeof pressed === 'boolean') {
    props['aria-pressed'] = pressed;
  }
  
  if (typeof expanded === 'boolean') {
    props['aria-expanded'] = expanded;
  }
  
  if (controls) {
    props['aria-controls'] = controls;
  }
  
  return props;
};

/**
 * Debounce function for performance optimization
 * @param {Function} func - The function to debounce
 * @param {number} wait - The delay in milliseconds
 * @returns {Function} The debounced function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};
