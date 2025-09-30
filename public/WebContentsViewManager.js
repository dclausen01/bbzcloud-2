/**
 * BBZCloud - WebContentsView Manager
 * 
 * This module manages WebContentsViews in the main process, replacing the deprecated
 * BrowserView-based architecture. WebContentsViews are the modern Electron approach
 * for embedding web content with better performance, security, and stability.
 * 
 * Key Features:
 * - Modern WebContentsView API (replaces deprecated BrowserView)
 * - Centralized view lifecycle management
 * - Automatic layout and bounds management
 * - Parallel initialization of standard apps
 * - Credential injection support
 * - Keyboard shortcut forwarding
 * - Memory and resource optimization
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.1.0
 */

const { WebContentsView } = require('electron');
const path = require('path');

class WebContentsViewManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.webContentsViews = new Map(); // id -> WebContentsView instance
    this.activeWebContentsView = null;
    this.standardApps = new Map(); // Preloaded standard apps
    this.isInitialized = false;
    this.headerHeight = 48; // Navigation bar height
    this.sidebarWidth = 450; // Width of sidebar drawers
    this.sidebarOpen = false; // Track if sidebar is open
    
    // PERFORMANCE: Cache bounds to avoid unnecessary calculations
    this.cachedBounds = null;
    this.boundsUpdatePending = false;
    
    // PERFORMANCE: Track view states to prevent unnecessary operations
    this.viewStates = new Map(); // id -> { isLoaded, lastUrl, isVisible }
    
    // Setup event handlers
    this.setupWindowEventHandlers();
    
    console.log('[WebContentsViewManager] Initialized with modern WebContentsView API');
  }

  /**
   * Setup window event handlers for layout management
   */
  setupWindowEventHandlers() {
    // PERFORMANCE: Debounce bounds updates to prevent excessive calculations
    let boundsUpdateTimeout = null;
    
    const debouncedBoundsUpdate = () => {
      if (boundsUpdateTimeout) {
        clearTimeout(boundsUpdateTimeout);
      }
      
      boundsUpdateTimeout = setTimeout(() => {
        this.updateActiveWebContentsViewBounds();
        this.cachedBounds = null; // Invalidate cache
      }, 16); // ~60fps
    };

    // Handle window resize events
    this.mainWindow.on('resize', debouncedBoundsUpdate);
    this.mainWindow.on('maximize', debouncedBoundsUpdate);
    this.mainWindow.on('unmaximize', debouncedBoundsUpdate);

    // Handle window close - cleanup WebContentsViews
    this.mainWindow.on('closed', () => {
      if (boundsUpdateTimeout) {
        clearTimeout(boundsUpdateTimeout);
      }
      this.cleanup();
    });
  }

  /**
   * Create a new WebContentsView with the specified configuration
   * 
   * @param {string} id - Unique identifier for the WebContentsView
   * @param {string} url - URL to load in the WebContentsView
   * @param {Object} options - Additional options for WebContentsView creation
   * @returns {Promise<WebContentsView>} - The created WebContentsView instance
   */
  async createWebContentsView(id, url, options = {}) {
    try {
      // Check if WebContentsView already exists
      if (this.webContentsViews.has(id)) {
        console.log(`[WebContentsViewManager] WebContentsView ${id} already exists`);
        return this.webContentsViews.get(id);
      }

      console.log(`[WebContentsViewManager] Creating WebContentsView for ${id} with URL: ${url}`);

      // Create WebContentsView with secure defaults
      const view = new WebContentsView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'webcontentsview-preload.js'), // Modern WebContentsView-specific preload
          webSecurity: true,
          partition: 'persist:main',
          sandbox: false, // Needed for credential injection
          devTools: process.env.NODE_ENV === 'development',
          additionalArguments: [
            `--webcontentsview-id=${id}`,
            `--webview-preload-script=${path.join(__dirname, 'webview-preload.js')}`
          ]
        }
      });

      // Store the WebContentsView
      this.webContentsViews.set(id, view);

      // Setup event handlers for this WebContentsView
      this.setupWebContentsViewEventHandlers(view, id);

      // Load the URL
      await view.webContents.loadURL(url);

      console.log(`[WebContentsViewManager] Successfully created WebContentsView ${id}`);
      return view;

    } catch (error) {
      console.error(`[WebContentsViewManager] Error creating WebContentsView ${id}:`, error);
      throw error;
    }
  }

  /**
   * Setup event handlers for a specific WebContentsView
   * 
   * @param {WebContentsView} view - The WebContentsView instance
   * @param {string} id - The WebContentsView identifier
   */
  setupWebContentsViewEventHandlers(view, id) {
    // Initialize view state tracking
    this.viewStates.set(id, {
      isLoaded: false,
      lastUrl: null,
      isVisible: false,
      loadStartTime: null
    });

    // FIX: Capture global app shortcuts BEFORE websites can handle them
    this.setupKeyboardShortcutCapture(view, id);

    // Loading events
    view.webContents.on('did-start-loading', () => {
      const state = this.viewStates.get(id);
      state.loadStartTime = Date.now();
      state.isLoaded = false;
      this.viewStates.set(id, state);
      
      console.log(`[WebContentsViewManager] ${id} started loading`);
      this.notifyRenderer('webcontentsview-loading', { id, loading: true });
    });

    view.webContents.on('did-stop-loading', () => {
      const state = this.viewStates.get(id);
      const loadTime = state.loadStartTime ? Date.now() - state.loadStartTime : 0;
      
      console.log(`[WebContentsViewManager] ${id} stopped loading (${loadTime}ms)`);
      this.notifyRenderer('webcontentsview-loading', { id, loading: false });
    });

    view.webContents.on('did-finish-load', async () => {
      const state = this.viewStates.get(id);
      const currentUrl = view.webContents.getURL();
      const loadTime = state.loadStartTime ? Date.now() - state.loadStartTime : 0;
      
      // Update state
      state.isLoaded = true;
      state.lastUrl = currentUrl;
      this.viewStates.set(id, state);
      
      console.log(`[WebContentsViewManager] ${id} finished loading (${loadTime}ms): ${currentUrl}`);
      this.notifyRenderer('webcontentsview-loaded', { id, url: currentUrl });
      
      // FIX: Trigger automatic credential injection by sending message to preload script
      try {
        await this.triggerCredentialInjectionDirect(view, id, currentUrl);
      } catch (error) {
        console.error(`[WebContentsViewManager] Error triggering credential injection for ${id}:`, error);
      }
    });

    // Navigation events
    view.webContents.on('did-navigate', (event, url) => {
      const state = this.viewStates.get(id);
      state.lastUrl = url;
      this.viewStates.set(id, state);
      
      console.log(`[WebContentsViewManager] ${id} navigated to: ${url}`);
      this.notifyRenderer('webcontentsview-navigated', { id, url });
    });

    // Error handling
    view.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      const state = this.viewStates.get(id);
      state.isLoaded = false;
      this.viewStates.set(id, state);
      
      console.error(`[WebContentsViewManager] ${id} failed to load:`, errorCode, errorDescription);
      this.notifyRenderer('webcontentsview-error', { 
        id, 
        error: { code: errorCode, description: errorDescription, url: validatedURL }
      });
    });

    // Handle new window requests
    view.webContents.setWindowOpenHandler(({ url }) => {
      console.log(`[WebContentsViewManager] ${id} requested new window for: ${url}`);
      
      // Handle specific URLs that should open externally
      if (
        url.includes('bbb.bbz-rd-eck.de/bigbluebutton/api/join?') ||
        url.includes('meet.stashcat.com')
      ) {
        require('electron').shell.openExternal(url);
        return { action: 'deny' };
      }

      // Create new WebContentsView window for other URLs
      this.notifyRenderer('webcontentsview-new-window', { url, title: 'BBZCloud' });
      return { action: 'deny' };
    });

    // Handle context menu
    view.webContents.on('context-menu', (event, params) => {
      if (params.selectionText) {
        this.notifyRenderer('webcontentsview-context-menu', {
          id,
          selectionText: params.selectionText,
          x: params.x,
          y: params.y
        });
      }
    });
  }

  /**
   * FIX: Setup keyboard shortcut capture using before-input-event
   * This captures shortcuts BEFORE websites can handle them
   * 
   * @param {WebContentsView} view - The WebContentsView instance
   * @param {string} id - The WebContentsView identifier
   */
  setupKeyboardShortcutCapture(view, id) {
    // Define global app shortcuts that should be captured before websites
    const GLOBAL_SHORTCUTS = [
      // Navigation shortcuts (Ctrl+1-9)
      { key: '1', ctrl: true, alt: false, shift: false, action: 'nav-app-1' },
      { key: '2', ctrl: true, alt: false, shift: false, action: 'nav-app-2' },
      { key: '3', ctrl: true, alt: false, shift: false, action: 'nav-app-3' },
      { key: '4', ctrl: true, alt: false, shift: false, action: 'nav-app-4' },
      { key: '5', ctrl: true, alt: false, shift: false, action: 'nav-app-5' },
      { key: '6', ctrl: true, alt: false, shift: false, action: 'nav-app-6' },
      { key: '7', ctrl: true, alt: false, shift: false, action: 'nav-app-7' },
      { key: '8', ctrl: true, alt: false, shift: false, action: 'nav-app-8' },
      { key: '9', ctrl: true, alt: false, shift: false, action: 'nav-app-9' },
      
      // Modal/overlay shortcuts
      { key: 'Escape', ctrl: false, alt: false, shift: false, action: 'close-modal' },
      
      // App feature shortcuts
      { key: 'p', ctrl: true, alt: false, shift: true, action: 'command-palette' },
      { key: 't', ctrl: true, alt: false, shift: true, action: 'toggle-todo' },
      { key: 'd', ctrl: true, alt: false, shift: false, action: 'toggle-secure-docs' },
      { key: ',', ctrl: true, alt: false, shift: false, action: 'open-settings' },
      
      // Reload shortcuts
      { key: 'F5', ctrl: true, alt: false, shift: false, action: 'reload-current' },
      { key: 'r', ctrl: true, alt: false, shift: true, action: 'reload-all' },
      
      // Fullscreen
      { key: 'F11', ctrl: false, alt: false, shift: false, action: 'toggle-fullscreen' },
      
      // WebContentsView navigation (these should work even in web apps)
      { key: 'ArrowLeft', ctrl: false, alt: true, shift: false, action: 'browserview-back' },
      { key: 'ArrowRight', ctrl: false, alt: true, shift: false, action: 'browserview-forward' },
      { key: 'F5', ctrl: false, alt: false, shift: false, action: 'browserview-refresh' },
      { key: 'r', ctrl: true, alt: false, shift: false, action: 'browserview-refresh' },
    ];

    view.webContents.on('before-input-event', (event, input) => {
      // Only process keyDown events
      if (input.type !== 'keyDown') return;

      // Normalize key names
      let key = input.key;
      
      // Check if this matches any global shortcut
      const matchedShortcut = GLOBAL_SHORTCUTS.find(shortcut => {
        const ctrlMatch = !!input.control === !!shortcut.ctrl || !!input.meta === !!shortcut.ctrl;
        const altMatch = !!input.alt === !!shortcut.alt;
        const shiftMatch = !!input.shift === !!shortcut.shift;
        const keyMatch = key === shortcut.key;
        
        return keyMatch && ctrlMatch && altMatch && shiftMatch;
      });

      if (matchedShortcut) {
        // Prevent the event from reaching the web page
        event.preventDefault();
        
        console.log(`[WebContentsViewManager] Captured global shortcut: ${matchedShortcut.action}`);
        
        // Handle the shortcut based on its action
        this.handleGlobalShortcut(view, id, matchedShortcut.action, input);
      }
    });

    console.log(`[WebContentsViewManager] Keyboard shortcut capture setup for ${id}`);
  }

  /**
   * Handle captured global shortcuts
   * 
   * @param {WebContentsView} view - The WebContentsView instance
   * @param {string} id - The WebContentsView identifier
   * @param {string} action - The shortcut action
   * @param {Object} input - The input event details
   */
  handleGlobalShortcut(view, id, action, input) {
    try {
      // Handle WebContentsView-specific shortcuts locally
      if (action.startsWith('browserview-')) {
        switch (action) {
          case 'browserview-refresh':
            view.webContents.reload();
            break;
            
          case 'browserview-back':
            if (view.webContents.canGoBack()) {
              view.webContents.goBack();
            }
            break;
            
          case 'browserview-forward':
            if (view.webContents.canGoForward()) {
              view.webContents.goForward();
            }
            break;
        }
        return;
      }

      // Forward all other global shortcuts to main window
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('webview-message', { 
          type: 'webview-shortcut', 
          action: action,
          webContentsViewId: id
        });
      }
    } catch (error) {
      console.error(`[WebContentsViewManager] Error handling shortcut ${action}:`, error);
    }
  }

  /**
   * Show a specific WebContentsView and hide the currently active one
   * 
   * @param {string} id - The identifier of the WebContentsView to show
   * @returns {Promise<boolean>} - True if successful, false otherwise
   */
  async showWebContentsView(id) {
    try {
      const view = this.webContentsViews.get(id);
      if (!view) {
        console.error(`[WebContentsViewManager] WebContentsView ${id} not found`);
        return false;
      }

      // If this view is already active, just ensure it's visible and focused
      if (this.activeWebContentsView === view) {
        console.log(`[WebContentsViewManager] WebContentsView ${id} is already active, ensuring visibility`);
        
        // Make sure the view is properly positioned and focused
        try {
          this.updateWebContentsViewBounds(view);
          view.webContents.focus();
        } catch (error) {
          console.warn('[WebContentsViewManager] Error ensuring view visibility:', error);
        }
        
        return true;
      }

      console.log(`[WebContentsViewManager] Switching to WebContentsView ${id}`);

      // ANTI-FLICKER: Set bounds for new view BEFORE adding it to prevent size jumps
      const bounds = this.mainWindow.getContentBounds();
      const newBounds = {
        x: 0,
        y: this.headerHeight,
        width: this.sidebarOpen ? bounds.width - this.sidebarWidth : bounds.width,
        height: bounds.height - this.headerHeight
      };

      // Pre-configure the view bounds to prevent flickering
      try {
        view.setBounds(newBounds);
      } catch (error) {
        console.warn('[WebContentsViewManager] Error pre-setting bounds:', error);
      }

      // PERFORMANCE: Add new view first, then remove old one to minimize visual gaps
      try {
        this.mainWindow.contentView.addChildView(view);
        console.log(`[WebContentsViewManager] Added WebContentsView ${id} to window`);
      } catch (error) {
        console.error(`[WebContentsViewManager] Error adding WebContentsView to window:`, error);
        return false;
      }

      // Remove the previously active view AFTER adding the new one
      if (this.activeWebContentsView && this.activeWebContentsView !== view) {
        try {
          this.mainWindow.contentView.removeChildView(this.activeWebContentsView);
          console.log(`[WebContentsViewManager] Removed previous WebContentsView from window`);
        } catch (error) {
          console.warn('[WebContentsViewManager] Error removing previous view:', error);
        }
      }

      // Set the new view as active
      this.activeWebContentsView = view;

      // Ensure bounds are correct after attachment
      this.updateWebContentsViewBounds(view);

      // PERFORMANCE: Reduce wait time and make it non-blocking
      setImmediate(() => {
        try {
          view.webContents.focus();
          console.log(`[WebContentsViewManager] Focused WebContentsView ${id}`);
        } catch (error) {
          console.warn('[WebContentsViewManager] Error focusing view:', error);
        }
      });

      // Notify renderer about the active view change immediately
      this.notifyRenderer('webcontentsview-activated', { id });

      console.log(`[WebContentsViewManager] Successfully switched to WebContentsView ${id}`);
      return true;

    } catch (error) {
      console.error(`[WebContentsViewManager] Error showing WebContentsView ${id}:`, error);
      return false;
    }
  }

  /**
   * Hide the currently active WebContentsView
   */
  hideActiveWebContentsView() {
    if (this.activeWebContentsView) {
      console.log('[WebContentsViewManager] Hiding active WebContentsView');
      this.mainWindow.contentView.removeChildView(this.activeWebContentsView);
      this.activeWebContentsView = null;
      this.notifyRenderer('webcontentsview-activated', { id: null });
    }
  }

  /**
   * Update the bounds of a specific WebContentsView or the active one
   * 
   * @param {WebContentsView} view - Optional specific view to update, defaults to active view
   */
  updateWebContentsViewBounds(view = null) {
    const targetView = view || this.activeWebContentsView;
    if (!targetView) return;

    try {
      const bounds = this.mainWindow.getContentBounds();
      
      const newBounds = {
        x: 0,
        y: this.headerHeight,
        width: this.sidebarOpen ? bounds.width - this.sidebarWidth : bounds.width,
        height: bounds.height - this.headerHeight
      };

      targetView.setBounds(newBounds);
      console.log(`[WebContentsViewManager] Updated bounds:`, newBounds, `(sidebar: ${this.sidebarOpen ? 'open' : 'closed'})`);

    } catch (error) {
      console.error('[WebContentsViewManager] Error updating bounds:', error);
    }
  }

  /**
   * Set sidebar state and update WebContentsView bounds accordingly
   * 
   * @param {boolean} isOpen - Whether the sidebar is open
   */
  setSidebarState(isOpen) {
    if (this.sidebarOpen !== isOpen) {
      this.sidebarOpen = isOpen;
      console.log(`[WebContentsViewManager] Sidebar state changed: ${isOpen ? 'open' : 'closed'}`);
      
      // Update bounds of active WebContentsView
      this.updateActiveWebContentsViewBounds();
    }
  }

  /**
   * Get current sidebar state
   * 
   * @returns {boolean} - Whether the sidebar is open
   */
  getSidebarState() {
    return this.sidebarOpen;
  }

  /**
   * Update bounds for the currently active WebContentsView
   */
  updateActiveWebContentsViewBounds() {
    this.updateWebContentsViewBounds();
  }

  /**
   * Navigate a specific WebContentsView to a new URL
   * 
   * @param {string} id - The WebContentsView identifier
   * @param {string} url - The URL to navigate to
   * @returns {Promise<boolean>} - True if successful
   */
  async navigateWebContentsView(id, url) {
    try {
      const view = this.webContentsViews.get(id);
      if (!view) {
        console.error(`[WebContentsViewManager] WebContentsView ${id} not found for navigation`);
        return false;
      }

      console.log(`[WebContentsViewManager] Navigating ${id} to: ${url}`);
      await view.webContents.loadURL(url);
      return true;

    } catch (error) {
      console.error(`[WebContentsViewManager] Error navigating ${id}:`, error);
      return false;
    }
  }

  /**
   * Reload a specific WebContentsView
   * 
   * @param {string} id - The WebContentsView identifier
   * @returns {boolean} - True if successful
   */
  reloadWebContentsView(id) {
    try {
      const view = this.webContentsViews.get(id);
      if (!view) {
        console.error(`[WebContentsViewManager] WebContentsView ${id} not found for reload`);
        return false;
      }

      console.log(`[WebContentsViewManager] Reloading ${id}`);
      view.webContents.reload();
      return true;

    } catch (error) {
      console.error(`[WebContentsViewManager] Error reloading ${id}:`, error);
      return false;
    }
  }

  /**
   * Execute JavaScript in a specific WebContentsView
   * 
   * @param {string} id - The WebContentsView identifier
   * @param {string} code - The JavaScript code to execute
   * @returns {Promise<any>} - The result of the JavaScript execution
   */
  async executeJavaScript(id, code) {
    try {
      const view = this.webContentsViews.get(id);
      if (!view) {
        throw new Error(`WebContentsView ${id} not found`);
      }

      return await view.webContents.executeJavaScript(code);

    } catch (error) {
      console.error(`[WebContentsViewManager] Error executing JavaScript in ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get the current URL of a specific WebContentsView
   * 
   * @param {string} id - The WebContentsView identifier
   * @returns {string|null} - The current URL or null if not found
   */
  getWebContentsViewURL(id) {
    const view = this.webContentsViews.get(id);
    return view ? view.webContents.getURL() : null;
  }

  /**
   * Get a WebContentsView instance by ID
   * 
   * @param {string} id - The WebContentsView identifier
   * @returns {WebContentsView|null} - The WebContentsView instance or null
   */
  getWebContentsView(id) {
    return this.webContentsViews.get(id) || null;
  }

  /**
   * Get the currently active WebContentsView
   * 
   * @returns {WebContentsView|null} - The active WebContentsView or null
   */
  getActiveWebContentsView() {
    return this.activeWebContentsView;
  }

  /**
   * Get all WebContentsView IDs
   * 
   * @returns {Array<string>} - Array of WebContentsView identifiers
   */
  getAllWebContentsViewIds() {
    return Array.from(this.webContentsViews.keys());
  }

  /**
   * Initialize standard apps as WebContentsViews
   * 
   * @param {Object} standardApps - Configuration object for standard apps
   * @returns {Promise<void>}
   */
  async initializeStandardApps(standardApps) {
    if (this.isInitialized) {
      console.log('[WebContentsViewManager] Standard apps already initialized');
      return;
    }

    console.log('[WebContentsViewManager] Initializing standard apps...');

    try {
      // Create WebContentsViews for all visible standard apps in parallel
      const creationPromises = Object.entries(standardApps)
        .filter(([_, config]) => config.visible)
        .map(async ([id, config]) => {
          try {
            await this.createWebContentsView(id, config.url, {
              title: config.title,
              isStandardApp: true
            });
            this.standardApps.set(id, config);
            console.log(`[WebContentsViewManager] Initialized standard app: ${id}`);
          } catch (error) {
            console.error(`[WebContentsViewManager] Failed to initialize ${id}:`, error);
          }
        });

      await Promise.all(creationPromises);
      this.isInitialized = true;
      
      console.log(`[WebContentsViewManager] Successfully initialized ${this.standardApps.size} standard apps`);

    } catch (error) {
      console.error('[WebContentsViewManager] Error initializing standard apps:', error);
    }
  }

  /**
   * Destroy a specific WebContentsView
   * 
   * @param {string} id - The WebContentsView identifier
   * @returns {boolean} - True if successful
   */
  destroyWebContentsView(id) {
    try {
      const view = this.webContentsViews.get(id);
      if (!view) {
        console.log(`[WebContentsViewManager] WebContentsView ${id} not found for destruction`);
        return false;
      }

      console.log(`[WebContentsViewManager] Destroying WebContentsView ${id}`);

      // Remove from main window if it's the active view
      if (this.activeWebContentsView === view) {
        this.mainWindow.contentView.removeChildView(view);
        this.activeWebContentsView = null;
      }

      // Destroy the view
      view.webContents.destroy();
      this.webContentsViews.delete(id);
      this.standardApps.delete(id);

      return true;

    } catch (error) {
      console.error(`[WebContentsViewManager] Error destroying WebContentsView ${id}:`, error);
      return false;
    }
  }

  /**
   * Inject credentials into a specific WebContentsView
   * 
   * @param {string} id - The WebContentsView identifier
   * @param {Object} credentials - The credentials to inject
   * @param {string} service - The service name for credential injection
   * @returns {Promise<boolean>} - True if successful
   */
  async injectCredentials(id, credentials, service) {
    try {
      const view = this.webContentsViews.get(id);
      if (!view) {
        console.error(`[WebContentsViewManager] WebContentsView ${id} not found for credential injection`);
        return false;
      }

      console.log(`[WebContentsViewManager] Injecting credentials for ${service} in WebContentsView ${id}`);

      // Send credential injection message to the WebContentsView's preload script
      view.webContents.send('inject-credentials', {
        webContentsViewId: id,
        service: service,
        credentials: credentials
      });

      return true;

    } catch (error) {
      console.error(`[WebContentsViewManager] Error injecting credentials for ${id}:`, error);
      return false;
    }
  }

  /**
   * FIX: Direct credential injection after page load (similar to old webview approach)
   * This method gets credentials from keytar and sends them directly to the preload script
   * 
   * @param {WebContentsView} view - The WebContentsView instance
   * @param {string} id - The WebContentsView identifier
   * @param {string} url - The current URL
   * @returns {Promise<boolean>} - True if injection was attempted
   */
  async triggerCredentialInjectionDirect(view, id, url) {
    try {
      const keytar = require('keytar');
      
      // Determine service based on URL
      let service = null;
      if (url.includes('webuntis.com') || url.includes('neilo.webuntis.com')) {
        service = 'webuntis';
      } else if (url.includes('schulcloud') || url.includes('dbildungscloud')) {
        service = 'schulcloud';
      } else if (url.includes('office.com') || url.includes('login.microsoftonline.com')) {
        service = 'office';
      } else if (url.includes('moodle') || url.includes('lms.bbz-rd-eck.de')) {
        service = 'moodle';
      }

      if (!service) {
        console.log(`[WebContentsViewManager] No credential injection needed for URL: ${url}`);
        return false;
      }

      console.log(`[WebContentsViewManager] Getting credentials for service: ${service}`);

      // Get all credentials from keytar
      const [emailResult, passwordResult, bbbPasswordResult, webuntisEmailResult, webuntisPasswordResult] = await Promise.all([
        keytar.getPassword('bbzcloud', 'email').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
        keytar.getPassword('bbzcloud', 'password').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
        keytar.getPassword('bbzcloud', 'bbbPassword').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
        keytar.getPassword('bbzcloud', 'webuntisEmail').then(password => ({ success: !!password, password })).catch(() => ({ success: false })),
        keytar.getPassword('bbzcloud', 'webuntisPassword').then(password => ({ success: !!password, password })).catch(() => ({ success: false }))
      ]);

      const credentials = {
        email: emailResult.success ? emailResult.password : null,
        password: passwordResult.success ? passwordResult.password : null,
        bbbPassword: bbbPasswordResult.success ? bbbPasswordResult.password : null,
        webuntisEmail: webuntisEmailResult.success ? webuntisEmailResult.password : null,
        webuntisPassword: webuntisPasswordResult.success ? webuntisPasswordResult.password : null
      };

      // Check if we have the required credentials
      if (!credentials.email && !credentials.webuntisEmail) {
        console.warn(`[WebContentsViewManager] Missing credentials for ${service}`);
        return false;
      }

      console.log(`[WebContentsViewManager] Sending credentials to preload script for ${service}`);

      // Send credentials directly to the WebContentsView's preload script
      view.webContents.send('inject-credentials', {
        service: service,
        credentials: credentials,
        webContentsViewId: id
      });

      return true;
    } catch (error) {
      console.error(`[WebContentsViewManager] Error in credential injection for ${id}:`, error);
      return false;
    }
  }

  /**
   * Trigger automatic credential injection based on URL
   * 
   * @param {string} id - The WebContentsView identifier
   * @param {string} url - The current URL
   * @param {Object} allCredentials - All available credentials
   * @returns {Promise<boolean>} - True if injection was attempted
   */
  async triggerAutoCredentialInjection(id, url, allCredentials) {
    try {
      // Determine service based on URL
      let service = null;
      
      if (url.includes('webuntis.com') || url.includes('neilo.webuntis.com')) {
        service = 'webuntis';
      } else if (url.includes('schulcloud') || url.includes('dbildungscloud')) {
        service = 'schulcloud';
      } else if (url.includes('office.com') || url.includes('login.microsoftonline.com')) {
        service = 'office';
      } else if (url.includes('moodle') || url.includes('lms.bbz-rd-eck.de')) {
        service = 'moodle';
      }

      if (!service) {
        console.log(`[WebContentsViewManager] No credential injection needed for URL: ${url}`);
        return false;
      }

      console.log(`[WebContentsViewManager] Auto-injecting credentials for service: ${service}`);
      return await this.injectCredentials(id, allCredentials, service);

    } catch (error) {
      console.error(`[WebContentsViewManager] Error in auto credential injection:`, error);
      return false;
    }
  }

  /**
   * Send a message to the renderer process
   * 
   * @param {string} channel - The IPC channel
   * @param {any} data - The data to send
   */
  notifyRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Cleanup all WebContentsViews and resources
   */
  cleanup() {
    console.log('[WebContentsViewManager] Cleaning up...');

    try {
      // Destroy all WebContentsViews
      for (const [id, view] of this.webContentsViews) {
        try {
          if (this.activeWebContentsView === view) {
            this.mainWindow.contentView.removeChildView(view);
          }
          view.webContents.destroy();
        } catch (error) {
          console.error(`[WebContentsViewManager] Error destroying ${id}:`, error);
        }
      }

      // Clear collections
      this.webContentsViews.clear();
      this.standardApps.clear();
      this.activeWebContentsView = null;
      this.isInitialized = false;

      console.log('[WebContentsViewManager] Cleanup completed');

    } catch (error) {
      console.error('[WebContentsViewManager] Error during cleanup:', error);
    }
  }

  /**
   * Get statistics about the WebContentsViewManager
   * 
   * @returns {Object} - Statistics object
   */
  getStats() {
    return {
      totalWebContentsViews: this.webContentsViews.size,
      standardApps: this.standardApps.size,
      activeWebContentsView: this.activeWebContentsView ? 'active' : 'none',
      isInitialized: this.isInitialized,
      webContentsViewIds: this.getAllWebContentsViewIds()
    };
  }
}

module.exports = WebContentsViewManager;
