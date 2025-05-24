// Application Constants
export const APP_CONFIG = {
  STARTUP_DELAY: 3000,
  NOTIFICATION_CHECK_INTERVAL: 8000,
  CREDENTIAL_INJECTION_DELAY: 1000,
  ERROR_RETRY_DELAY: 3000,
  WEBVIEW_RELOAD_DELAY: 5000,
  UPDATE_CHECK_INTERVAL: 15 * 60 * 1000, // 15 minutes
};

// URLs
export const URLS = {
  BBZ_WEBSITE: 'https://www.bbz-rd-eck.de',
  SCHULCLOUD: 'https://app.schul.cloud',
  MOODLE: 'https://portal.bbz-rd-eck.com',
  BBB_SIGNIN: 'https://bbb.bbz-rd-eck.de/b/signin',
  OUTLOOK: 'https://exchange.bbz-rd-eck.de/owa/#path=/mail',
  OFFICE: 'https://m365.cloud.microsoft/?auth=2',
  CRYPTPAD: 'https://cryptpad.fr/drive',
  TASKCARDS: 'https://bbzrdeck.taskcards.app',
  WEBUNTIS: 'https://neilo.webuntis.com/WebUntis/?school=bbz-rd-eck#/basic/login',
  FOBIZZ: 'https://tools.fobizz.com/',
  WIKI: 'https://wiki.bbz-rd-eck.com',
  HANDBOOK: 'https://viflow.bbz-rd-eck.de/viflow/',
};

// Error Messages (German)
export const ERROR_MESSAGES = {
  CONNECTION_INTERRUPTED: 'Die Verbindung wurde unterbrochen',
  SERVER_NOT_FOUND: 'Der Server konnte nicht gefunden werden',
  CONNECTION_RESET: 'Die Verbindung wurde zurückgesetzt',
  SERVER_CONNECTION_FAILED: 'Die Serververbindung ist fehlgeschlagen',
  NETWORK_DISCONNECTED: 'Die Netzwerkverbindung wurde getrennt',
  DNS_RESOLUTION_FAILED: 'Die Server-Adresse konnte nicht aufgelöst werden',
  INTERNET_UNAVAILABLE: 'Das Internet ist nicht verfügbar',
  CONNECTION_REFUSED: 'Die Serververbindung wurde abgelehnt',
  INSECURE_CONNECTION: 'Die Webseite konnte nicht sicher aufgerufen werden',
  CERTIFICATE_ERROR: 'Die Verbindung ist nicht sicher',
  GENERIC_LOAD_ERROR: 'Die Seite konnte nicht geladen werden',
  CREDENTIALS_NOT_FOUND: 'Bitte richten Sie zuerst ein Passwort in den Einstellungen ein.',
  DECRYPTION_FAILED: 'Fehler beim Entschlüsseln der Daten',
  DATABASE_ERROR: 'Datenbankfehler aufgetreten',
  ASSET_NOT_FOUND: 'Ressource konnte nicht gefunden werden',
};

// Success Messages (German)
export const SUCCESS_MESSAGES = {
  LINK_COPIED: 'Link kopiert',
  SETTINGS_SAVED: 'Einstellungen gespeichert',
  DATABASE_LOCATION_SET: 'Datenbank-Speicherort festgelegt',
  DOWNLOAD_COMPLETED: 'Download abgeschlossen',
  CREDENTIALS_SAVED: 'Anmeldedaten gespeichert',
};

// Keyboard Shortcuts
export const KEYBOARD_SHORTCUTS = {
  // Global shortcuts
  TOGGLE_TODO: 'ctrl+t',
  TOGGLE_SECURE_DOCS: 'ctrl+d',
  OPEN_SETTINGS: 'ctrl+comma',
  RELOAD_CURRENT: 'ctrl+r',
  RELOAD_ALL: 'ctrl+shift+r',
  TOGGLE_FULLSCREEN: 'f11',
  CLOSE_MODAL: 'escape',
  
  // Navigation shortcuts (Ctrl/Cmd + number)
  NAV_APP_1: 'ctrl+1',
  NAV_APP_2: 'ctrl+2',
  NAV_APP_3: 'ctrl+3',
  NAV_APP_4: 'ctrl+4',
  NAV_APP_5: 'ctrl+5',
  NAV_APP_6: 'ctrl+6',
  NAV_APP_7: 'ctrl+7',
  NAV_APP_8: 'ctrl+8',
  NAV_APP_9: 'ctrl+9',
  
  // WebView shortcuts
  WEBVIEW_BACK: 'alt+left',
  WEBVIEW_FORWARD: 'alt+right',
  WEBVIEW_REFRESH: 'f5',
  WEBVIEW_FIND: 'ctrl+f',
  WEBVIEW_ZOOM_IN: 'ctrl+plus',
  WEBVIEW_ZOOM_OUT: 'ctrl+minus',
  WEBVIEW_ZOOM_RESET: 'ctrl+0',
  
  // Print
  PRINT: 'ctrl+p',
};

// Error Code Mappings
export const ERROR_CODE_MAPPINGS = {
  '-2': ERROR_MESSAGES.CONNECTION_INTERRUPTED,
  '-3': ERROR_MESSAGES.SERVER_NOT_FOUND,
  '-6': ERROR_MESSAGES.CONNECTION_RESET,
  '-7': ERROR_MESSAGES.SERVER_CONNECTION_FAILED,
  '-21': ERROR_MESSAGES.NETWORK_DISCONNECTED,
  '-105': ERROR_MESSAGES.DNS_RESOLUTION_FAILED,
  '-106': ERROR_MESSAGES.INTERNET_UNAVAILABLE,
  '-109': ERROR_MESSAGES.CONNECTION_REFUSED,
  '-201': ERROR_MESSAGES.INSECURE_CONNECTION,
  '-202': ERROR_MESSAGES.CERTIFICATE_ERROR,
};

// WebView Configuration
export const WEBVIEW_CONFIG = {
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  PARTITION: 'persist:main',
  WEB_PREFERENCES: 'nativeWindowOpen=yes,javascript=yes,plugins=yes,contextIsolation=no,devTools=yes',
  ALLOW_POPUPS: 'true',
};

// Database Configuration
export const DATABASE_CONFIG = {
  SERVICE_NAME: 'bbzcloud',
  ACCOUNTS: {
    EMAIL: 'email',
    PASSWORD: 'password',
    BBB_PASSWORD: 'bbbPassword',
    WEBUNTIS_EMAIL: 'webuntisEmail',
    WEBUNTIS_PASSWORD: 'webuntisPassword',
  },
};

// UI Configuration
export const UI_CONFIG = {
  HEADER_HEIGHT: '48px',
  DRAWER_WIDTH: '450px',
  MIN_WINDOW_WIDTH: 1000,
  MIN_WINDOW_HEIGHT: 700,
  TOAST_DURATION: 5000,
  NOTIFICATION_DURATION: 2000,
};

// Zoom Configuration
export const ZOOM_CONFIG = {
  MIN_ZOOM: 0.5,
  MAX_ZOOM: 2.0,
  DEFAULT_ZOOM: 1.0,
  DEFAULT_NAVBAR_ZOOM: 0.9,
  ZOOM_STEP: 0.1,
};

// File Extensions for Secure Documents
export const SUPPORTED_FILE_EXTENSIONS = [
  '.txt', '.md', '.doc', '.docx', '.pdf', '.rtf',
  '.xls', '.xlsx', '.ppt', '.pptx',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp',
  '.zip', '.rar', '.7z',
];

// Notification Settings
export const NOTIFICATION_CONFIG = {
  RED_PIXEL_THRESHOLD: 0.4, // 40% red pixels to detect notification badge
  ALPHA_THRESHOLD: 200, // Minimum alpha value for pixel detection
  CHECK_QUADRANT: {
    START_X_PERCENT: 0.5,
    START_Y_PERCENT: 0.5,
    WIDTH_PERCENT: 0.5,
    HEIGHT_PERCENT: 0.5,
  },
};

// Accessibility
export const ACCESSIBILITY = {
  FOCUS_VISIBLE_OUTLINE: '2px solid #3182ce',
  FOCUS_VISIBLE_OUTLINE_OFFSET: '2px',
  SKIP_LINK_STYLES: {
    position: 'absolute',
    left: '-9999px',
    zIndex: 999999,
    padding: '8px 16px',
    background: '#000',
    color: '#fff',
    textDecoration: 'none',
    borderRadius: '4px',
  },
};
