/**
 * BBZCloud - Application Constants
 * 
 * This file contains all the configuration constants used throughout the BBZCloud application.
 * These constants make it easy to customize the application for different organizations
 * without having to search through the entire codebase.
 * 
 * CUSTOMIZATION GUIDE:
 * 1. Update URLS object with your organization's web applications
 * 2. Modify ERROR_MESSAGES and SUCCESS_MESSAGES for your language
 * 3. Adjust KEYBOARD_SHORTCUTS to match your preferred shortcuts
 * 4. Update WEBVIEW_CONFIG if you need different browser settings
 * 5. Modify DATABASE_CONFIG service name for your organization
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.0.38
 */

// ============================================================================
// APPLICATION CONFIGURATION
// ============================================================================

/**
 * Core application timing and behavior settings
 * These control various delays and intervals throughout the application
 */
export const APP_CONFIG = {
  STARTUP_DELAY: 3000,                    // Delay before showing main window (ms)
  NOTIFICATION_CHECK_INTERVAL: 8000,     // How often to check for notifications (ms)
  CREDENTIAL_INJECTION_DELAY: 1000,      // Delay before injecting credentials (ms)
  ERROR_RETRY_DELAY: 3000,               // Delay before retrying failed operations (ms)
  WEBVIEW_RELOAD_DELAY: 5000,            // Delay before reloading webviews (ms)
  UPDATE_CHECK_INTERVAL: 15 * 60 * 1000, // How often to check for app updates (15 minutes)
};

// ============================================================================
// WEB APPLICATION URLS
// ============================================================================

/**
 * URLs for all integrated web applications
 * 
 * CUSTOMIZATION: Replace these URLs with your organization's applications
 * Each URL should point to the login page or main dashboard of the service
 */
export const URLS = {
  // Organization website
  BBZ_WEBSITE: 'https://www.bbz-rd-eck.de',
  
  // Educational platforms
  SCHULCLOUD: 'https://app.schul.cloud',                                    // Cloud-based learning platform
  MOODLE: 'https://portal.bbz-rd-eck.com',                                 // Learning management system
  
  // Communication tools
  BBB_SIGNIN: 'https://bbb.bbz-rd-eck.de/b/signin',                       // BigBlueButton video conferencing
  OUTLOOK: 'https://exchange.bbz-rd-eck.de/owa/#path=/mail',              // Email client
  
  // Productivity applications
  OFFICE: 'https://m365.cloud.microsoft/?auth=2',                         // Microsoft Office 365
  CRYPTPAD: 'https://cryptpad.fr/drive',                                  // Encrypted collaborative documents
  TASKCARDS: 'https://bbzrdeck.taskcards.app',                           // Digital task cards
  
  // Administrative tools
  WEBUNTIS: 'https://neilo.webuntis.com/WebUntis/?school=bbz-rd-eck#/basic/login', // Timetable management
  FOBIZZ: 'https://tools.fobizz.com/',                                    // Educational tools
  WIKI: 'https://wiki.bbz-rd-eck.com',                                    // Internal wiki/documentation
  HANDBOOK: 'https://viflow.bbz-rd-eck.de/viflow/',                       // Process handbook
};

// ============================================================================
// USER INTERFACE MESSAGES
// ============================================================================

/**
 * Error messages displayed to users (in German)
 * 
 * CUSTOMIZATION: Translate these messages to your preferred language
 * These messages are shown when various error conditions occur
 */
export const ERROR_MESSAGES = {
  // Network-related errors
  CONNECTION_INTERRUPTED: 'Die Verbindung wurde unterbrochen',
  SERVER_NOT_FOUND: 'Der Server konnte nicht gefunden werden',
  CONNECTION_RESET: 'Die Verbindung wurde zurückgesetzt',
  SERVER_CONNECTION_FAILED: 'Die Serververbindung ist fehlgeschlagen',
  NETWORK_DISCONNECTED: 'Die Netzwerkverbindung wurde getrennt',
  DNS_RESOLUTION_FAILED: 'Die Server-Adresse konnte nicht aufgelöst werden',
  INTERNET_UNAVAILABLE: 'Das Internet ist nicht verfügbar',
  CONNECTION_REFUSED: 'Die Serververbindung wurde abgelehnt',
  
  // Security-related errors
  INSECURE_CONNECTION: 'Die Webseite konnte nicht sicher aufgerufen werden',
  CERTIFICATE_ERROR: 'Die Verbindung ist nicht sicher',
  
  // Application-specific errors
  GENERIC_LOAD_ERROR: 'Die Seite konnte nicht geladen werden',
  CREDENTIALS_NOT_FOUND: 'Bitte richten Sie zuerst ein Passwort in den Einstellungen ein.',
  DECRYPTION_FAILED: 'Fehler beim Entschlüsseln der Daten',
  DATABASE_ERROR: 'Datenbankfehler aufgetreten',
  ASSET_NOT_FOUND: 'Ressource konnte nicht gefunden werden',
};

/**
 * Success messages displayed to users (in German)
 * 
 * CUSTOMIZATION: Translate these messages to your preferred language
 * These messages are shown when operations complete successfully
 */
export const SUCCESS_MESSAGES = {
  LINK_COPIED: 'Link kopiert',
  SETTINGS_SAVED: 'Einstellungen gespeichert',
  DATABASE_LOCATION_SET: 'Datenbank-Speicherort festgelegt',
  DOWNLOAD_COMPLETED: 'Download abgeschlossen',
  CREDENTIALS_SAVED: 'Anmeldedaten gespeichert',
};

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

/**
 * Keyboard shortcuts for application functionality
 * 
 * CUSTOMIZATION: Modify these shortcuts to match your preferences
 * Uses Electron's accelerator format (https://www.electronjs.org/docs/api/accelerator)
 */
export const KEYBOARD_SHORTCUTS = {
  // Global application shortcuts
  TOGGLE_TODO: 'ctrl+t',           // Open/close todo drawer
  TOGGLE_SECURE_DOCS: 'ctrl+d',    // Open/close secure documents drawer
  OPEN_SETTINGS: 'ctrl+comma',     // Open settings panel
  RELOAD_CURRENT: 'ctrl+r',        // Reload current webview
  RELOAD_ALL: 'ctrl+shift+r',      // Reload all webviews
  TOGGLE_FULLSCREEN: 'f11',        // Toggle fullscreen mode
  CLOSE_MODAL: 'escape',           // Close open modals/drawers
  
  // Quick navigation shortcuts (Ctrl/Cmd + number)
  NAV_APP_1: 'ctrl+1',             // Navigate to first app
  NAV_APP_2: 'ctrl+2',             // Navigate to second app
  NAV_APP_3: 'ctrl+3',             // Navigate to third app
  NAV_APP_4: 'ctrl+4',             // Navigate to fourth app
  NAV_APP_5: 'ctrl+5',             // Navigate to fifth app
  NAV_APP_6: 'ctrl+6',             // Navigate to sixth app
  NAV_APP_7: 'ctrl+7',             // Navigate to seventh app
  NAV_APP_8: 'ctrl+8',             // Navigate to eighth app
  NAV_APP_9: 'ctrl+9',             // Navigate to ninth app
  
  // WebView navigation shortcuts
  WEBVIEW_BACK: 'alt+left',        // Go back in webview history
  WEBVIEW_FORWARD: 'alt+right',    // Go forward in webview history
  WEBVIEW_REFRESH: 'f5',           // Refresh current webview
  WEBVIEW_FIND: 'ctrl+f',          // Open find dialog in webview
  WEBVIEW_ZOOM_IN: 'ctrl+plus',    // Zoom in webview
  WEBVIEW_ZOOM_OUT: 'ctrl+minus',  // Zoom out webview
  WEBVIEW_ZOOM_RESET: 'ctrl+0',    // Reset webview zoom
  
  // Utility shortcuts
  PRINT: 'ctrl+p',                 // Print current webview content
};

// ============================================================================
// ERROR CODE MAPPINGS
// ============================================================================

/**
 * Maps Chromium error codes to user-friendly messages
 * These are the most common network errors that users might encounter
 */
export const ERROR_CODE_MAPPINGS = {
  '-2': ERROR_MESSAGES.CONNECTION_INTERRUPTED,    // FAILED
  '-3': ERROR_MESSAGES.SERVER_NOT_FOUND,         // ABORTED
  '-6': ERROR_MESSAGES.CONNECTION_RESET,         // CONNECTION_RESET
  '-7': ERROR_MESSAGES.SERVER_CONNECTION_FAILED, // CONNECTION_REFUSED
  '-21': ERROR_MESSAGES.NETWORK_DISCONNECTED,    // NETWORK_CHANGED
  '-105': ERROR_MESSAGES.DNS_RESOLUTION_FAILED,  // NAME_NOT_RESOLVED
  '-106': ERROR_MESSAGES.INTERNET_UNAVAILABLE,   // INTERNET_DISCONNECTED
  '-109': ERROR_MESSAGES.CONNECTION_REFUSED,     // ADDRESS_UNREACHABLE
  '-201': ERROR_MESSAGES.INSECURE_CONNECTION,    // CERT_COMMON_NAME_INVALID
  '-202': ERROR_MESSAGES.CERTIFICATE_ERROR,      // CERT_AUTHORITY_INVALID
};

// ============================================================================
// WEBVIEW CONFIGURATION
// ============================================================================

/**
 * Configuration for embedded webviews
 * 
 * CUSTOMIZATION: Modify these settings if you need different browser behavior
 * - USER_AGENT: Controls how websites identify the browser
 * - PARTITION: Isolates cookies and storage between webviews
 * - WEB_PREFERENCES: Controls webview capabilities and security
 */
export const WEBVIEW_CONFIG = {
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  PARTITION: 'persist:main',
  WEB_PREFERENCES: 'nativeWindowOpen=yes,javascript=yes,plugins=yes,contextIsolation=no,devTools=yes',
  ALLOW_POPUPS: 'true',
};

// ============================================================================
// DATABASE CONFIGURATION
// ============================================================================

/**
 * Configuration for credential storage and database operations
 * 
 * CUSTOMIZATION: Change SERVICE_NAME to your organization's identifier
 * This affects how credentials are stored in the system keychain
 */
export const DATABASE_CONFIG = {
  SERVICE_NAME: 'bbzcloud',                    // Keychain service identifier
  ACCOUNTS: {
    EMAIL: 'email',                           // Primary email account
    PASSWORD: 'password',                     // Primary password
    BBB_PASSWORD: 'bbbPassword',              // BigBlueButton password
    WEBUNTIS_EMAIL: 'webuntisEmail',          // WebUntis username
    WEBUNTIS_PASSWORD: 'webuntisPassword',    // WebUntis password
  },
};

// ============================================================================
// USER INTERFACE CONFIGURATION
// ============================================================================

/**
 * UI layout and timing configuration
 * 
 * CUSTOMIZATION: Adjust these values to change the application's appearance
 * - Dimensions are in CSS units (px, rem, etc.)
 * - Durations are in milliseconds
 */
export const UI_CONFIG = {
  HEADER_HEIGHT: '48px',           // Height of the main navigation bar
  DRAWER_WIDTH: '450px',           // Width of side drawers (todo, settings, etc.)
  MIN_WINDOW_WIDTH: 1000,          // Minimum application window width
  MIN_WINDOW_HEIGHT: 700,          // Minimum application window height
  TOAST_DURATION: 5000,            // How long error messages are shown (ms)
  NOTIFICATION_DURATION: 2000,     // How long success messages are shown (ms)
};

// ============================================================================
// ZOOM CONFIGURATION
// ============================================================================

/**
 * Zoom level configuration for webviews and UI elements
 * 
 * CUSTOMIZATION: Adjust these values to change default zoom levels
 * - Values are multipliers (1.0 = 100%, 1.5 = 150%, etc.)
 */
export const ZOOM_CONFIG = {
  MIN_ZOOM: 0.5,                   // Minimum allowed zoom level (50%)
  MAX_ZOOM: 2.0,                   // Maximum allowed zoom level (200%)
  DEFAULT_ZOOM: 1.0,               // Default zoom for webviews (100%)
  DEFAULT_NAVBAR_ZOOM: 0.9,        // Default zoom for navigation bar (90%)
  ZOOM_STEP: 0.1,                  // Increment for zoom in/out operations
};

// ============================================================================
// FILE HANDLING CONFIGURATION
// ============================================================================

/**
 * Supported file extensions for secure document storage
 * 
 * CUSTOMIZATION: Add or remove file extensions based on your needs
 * These files can be encrypted and stored securely within the application
 */
export const SUPPORTED_FILE_EXTENSIONS = [
  // Text documents
  '.txt', '.md', '.doc', '.docx', '.pdf', '.rtf',
  
  // Spreadsheets and presentations
  '.xls', '.xlsx', '.ppt', '.pptx',
  
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.bmp',
  
  // Archives
  '.zip', '.rar', '.7z',
];

// ============================================================================
// NOTIFICATION DETECTION CONFIGURATION
// ============================================================================

/**
 * Configuration for detecting notification badges in webviews
 * 
 * CUSTOMIZATION: Adjust these values if notification detection isn't working
 * - Thresholds control sensitivity of badge detection
 * - Quadrant settings define where to look for badges (usually top-right)
 */
export const NOTIFICATION_CONFIG = {
  RED_PIXEL_THRESHOLD: 0.4,        // Percentage of red pixels needed to detect badge (40%)
  ALPHA_THRESHOLD: 200,            // Minimum opacity for pixel detection (0-255)
  CHECK_QUADRANT: {
    START_X_PERCENT: 0.5,          // Start checking from 50% across the icon
    START_Y_PERCENT: 0.5,          // Start checking from 50% down the icon
    WIDTH_PERCENT: 0.5,            // Check the right 50% of the icon
    HEIGHT_PERCENT: 0.5,           // Check the bottom 50% of the icon
  },
};

// ============================================================================
// ACCESSIBILITY CONFIGURATION
// ============================================================================

/**
 * Accessibility settings for screen readers and keyboard navigation
 * 
 * CUSTOMIZATION: Modify these settings to improve accessibility
 * - Focus styles help users see which element is selected
 * - Skip links help screen reader users navigate quickly
 */
export const ACCESSIBILITY = {
  FOCUS_VISIBLE_OUTLINE: '2px solid #3182ce',      // Focus indicator color and style
  FOCUS_VISIBLE_OUTLINE_OFFSET: '2px',             // Space between element and focus outline
  SKIP_LINK_STYLES: {
    position: 'absolute',
    left: '-9999px',                               // Hidden by default
    zIndex: 999999,                                // Appears above everything when focused
    padding: '8px 16px',
    background: '#000',
    color: '#fff',
    textDecoration: 'none',
    borderRadius: '4px',
  },
};
