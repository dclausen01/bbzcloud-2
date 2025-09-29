/**
 * BBZCloud - BrowserView Manager
 * 
 * This module manages BrowserViews in the main process, replacing the previous
 * WebView-based architecture. BrowserViews provide better performance, security,
 * and keyboard shortcut handling compared to WebViews.
 * 
 * Key Features:
 * - Centralized BrowserView lifecycle management
 * - Automatic layout and bounds management
 * - Parallel initialization of standard apps
 * - Credential injection support
 * - Keyboard shortcut forwarding
 * - Memory and resource optimization
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.0.39
 */

const { BrowserView } = require('electron');
const path = require('path');

class BrowserViewManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.browserViews = new Map(); // id -> BrowserView instance
    this.activeBrowserView = null;
    this.standardApps = new Map(); // Preloaded standard apps
    this.isInitialized = false;
    this.headerHeight = 48; // Navigation bar height
    this.sidebarWidth = 450; // Width of sidebar drawers
    this.sidebarOpen = false; // Track if sidebar is open
    
    // Setup event handlers
    this.setupWindowEventHandlers();
    
    console.log('[BrowserViewManager] Initialized');
  }

  /**
   * Setup window event handlers for layout management
   */
  setupWindowEventHandlers() {
    // Handle window resize events
    this.mainWindow.on('resize', () => {
      this.updateActiveBrowserViewBounds();
    });

    this.mainWindow.on('maximize', () => {
      this.updateActiveBrowserViewBounds();
    });

    this.mainWindow.on('unmaximize', () => {
      this.updateActiveBrowserViewBounds();
    });

    // Handle window close - cleanup BrowserViews
    this.mainWindow.on('closed', () => {
      this.cleanup();
    });
  }

  /**
   * Create a new BrowserView with the specified configuration
   * 
   * @param {string} id - Unique identifier for the BrowserView
   * @param {string} url - URL to load in the BrowserView
   * @param {Object} options - Additional options for BrowserView creation
   * @returns {Promise<BrowserView>} - The created BrowserView instance
   */
  async createBrowserView(id, url, options = {}) {
    try {
      // Check if BrowserView already exists
      if (this.browserViews.has(id)) {
        console.log(`[BrowserViewManager] BrowserView ${id} already exists`);
        return this.browserViews.get(id);
      }

      console.log(`[BrowserViewManager] Creating BrowserView for ${id} with URL: ${url}`);

      // Create BrowserView with secure defaults
      const view = new BrowserView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'browserview-preload.js'),
          webSecurity: true,
          partition: 'persist:main',
          sandbox: false, // Needed for credential injection
          devTools: process.env.NODE_ENV === 'development',
          additionalArguments: [
            `--browserview-id=${id}`,
            `--webview-preload-script=${path.join(__dirname, 'webview-preload.js')}`
          ]
        }
      });

      // Store the BrowserView
      this.browserViews.set(id, view);

      // Setup event handlers for this BrowserView
      this.setupBrowserViewEventHandlers(view, id);

      // Load the URL
      await view.webContents.loadURL(url);

      console.log(`[BrowserViewManager] Successfully created BrowserView ${id}`);
      return view;

    } catch (error) {
      console.error(`[BrowserViewManager] Error creating BrowserView ${id}:`, error);
      throw error;
    }
  }

  /**
   * Setup event handlers for a specific BrowserView
   * 
   * @param {BrowserView} view - The BrowserView instance
   * @param {string} id - The BrowserView identifier
   */
  setupBrowserViewEventHandlers(view, id) {
    // Loading events
    view.webContents.on('did-start-loading', () => {
      console.log(`[BrowserViewManager] ${id} started loading`);
      this.notifyRenderer('browserview-loading', { id, loading: true });
    });

    view.webContents.on('did-stop-loading', () => {
      console.log(`[BrowserViewManager] ${id} stopped loading`);
      this.notifyRenderer('browserview-loading', { id, loading: false });
    });

    view.webContents.on('did-finish-load', () => {
      console.log(`[BrowserViewManager] ${id} finished loading`);
      this.notifyRenderer('browserview-loaded', { id, url: view.webContents.getURL() });
    });

    // Navigation events
    view.webContents.on('did-navigate', (event, url) => {
      console.log(`[BrowserViewManager] ${id} navigated to: ${url}`);
      this.notifyRenderer('browserview-navigated', { id, url });
    });

    // Error handling
    view.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error(`[BrowserViewManager] ${id} failed to load:`, errorCode, errorDescription);
      this.notifyRenderer('browserview-error', { 
        id, 
        error: { code: errorCode, description: errorDescription, url: validatedURL }
      });
    });

    // Handle new window requests
    view.webContents.setWindowOpenHandler(({ url }) => {
      console.log(`[BrowserViewManager] ${id} requested new window for: ${url}`);
      
      // Handle specific URLs that should open externally
      if (
        url.includes('bbb.bbz-rd-eck.de/bigbluebutton/api/join?') ||
        url.includes('meet.stashcat.com')
      ) {
        require('electron').shell.openExternal(url);
        return { action: 'deny' };
      }

      // Create new BrowserView window for other URLs
      this.notifyRenderer('browserview-new-window', { url, title: 'BBZCloud' });
      return { action: 'deny' };
    });

    // Handle context menu
    view.webContents.on('context-menu', (event, params) => {
      if (params.selectionText) {
        this.notifyRenderer('browserview-context-menu', {
          id,
          selectionText: params.selectionText,
          x: params.x,
          y: params.y
        });
      }
    });
  }

  /**
   * Show a specific BrowserView and hide the currently active one
   * 
   * @param {string} id - The identifier of the BrowserView to show
   * @returns {Promise<boolean>} - True if successful, false otherwise
   */
  async showBrowserView(id) {
    try {
      const view = this.browserViews.get(id);
      if (!view) {
        console.error(`[BrowserViewManager] BrowserView ${id} not found`);
        return false;
      }

      // If this view is already active, just ensure it's visible and focused
      if (this.activeBrowserView === view) {
        console.log(`[BrowserViewManager] BrowserView ${id} is already active, ensuring visibility`);
        
        // Make sure the view is actually attached to the window
        try {
          this.mainWindow.setBrowserView(view);
          this.updateBrowserViewBounds(view);
          view.webContents.focus();
        } catch (error) {
          console.warn('[BrowserViewManager] Error ensuring view visibility:', error);
        }
        
        return true;
      }

      console.log(`[BrowserViewManager] Switching to BrowserView ${id}`);

      // CRITICAL: Clear any existing BrowserView first
      try {
        // Remove ALL BrowserViews from the window to ensure clean state
        this.mainWindow.setBrowserView(null);
        console.log(`[BrowserViewManager] Cleared all BrowserViews from window`);
      } catch (error) {
        console.warn('[BrowserViewManager] Error clearing BrowserViews:', error);
      }

      // Wait for the window to be in a clean state
      await new Promise(resolve => setTimeout(resolve, 50));

      // Set the new view as active
      this.activeBrowserView = view;

      // Add the new view to the window
      try {
        this.mainWindow.setBrowserView(view);
        console.log(`[BrowserViewManager] Added BrowserView ${id} to window`);
      } catch (error) {
        console.error(`[BrowserViewManager] Error adding BrowserView to window:`, error);
        return false;
      }
      
      // Update bounds immediately after attachment
      this.updateBrowserViewBounds(view);

      // Wait for proper attachment and rendering
      await new Promise(resolve => setTimeout(resolve, 100));

      // Focus the BrowserView for proper input handling
      try {
        view.webContents.focus();
        console.log(`[BrowserViewManager] Focused BrowserView ${id}`);
      } catch (error) {
        console.warn('[BrowserViewManager] Error focusing view:', error);
      }

      // Verify the view is actually visible by checking if it has bounds
      try {
        const bounds = view.getBounds();
        console.log(`[BrowserViewManager] BrowserView ${id} bounds:`, bounds);
        
        if (bounds.width === 0 || bounds.height === 0) {
          console.warn(`[BrowserViewManager] BrowserView ${id} has zero bounds, retrying...`);
          this.updateBrowserViewBounds(view);
        }
      } catch (error) {
        console.warn('[BrowserViewManager] Error checking view bounds:', error);
      }

      // Notify renderer about the active view change
      this.notifyRenderer('browserview-activated', { id });

      console.log(`[BrowserViewManager] Successfully switched to BrowserView ${id}`);
      return true;

    } catch (error) {
      console.error(`[BrowserViewManager] Error showing BrowserView ${id}:`, error);
      return false;
    }
  }

  /**
   * Hide the currently active BrowserView
   */
  hideActiveBrowserView() {
    if (this.activeBrowserView) {
      console.log('[BrowserViewManager] Hiding active BrowserView');
      this.mainWindow.removeBrowserView(this.activeBrowserView);
      this.activeBrowserView = null;
      this.notifyRenderer('browserview-activated', { id: null });
    }
  }

  /**
   * Update the bounds of a specific BrowserView or the active one
   * 
   * @param {BrowserView} view - Optional specific view to update, defaults to active view
   */
  updateBrowserViewBounds(view = null) {
    const targetView = view || this.activeBrowserView;
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
      console.log(`[BrowserViewManager] Updated bounds:`, newBounds, `(sidebar: ${this.sidebarOpen ? 'open' : 'closed'})`);

    } catch (error) {
      console.error('[BrowserViewManager] Error updating bounds:', error);
    }
  }

  /**
   * Set sidebar state and update BrowserView bounds accordingly
   * 
   * @param {boolean} isOpen - Whether the sidebar is open
   */
  setSidebarState(isOpen) {
    if (this.sidebarOpen !== isOpen) {
      this.sidebarOpen = isOpen;
      console.log(`[BrowserViewManager] Sidebar state changed: ${isOpen ? 'open' : 'closed'}`);
      
      // Update bounds of active BrowserView
      this.updateActiveBrowserViewBounds();
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
   * Update bounds for the currently active BrowserView
   */
  updateActiveBrowserViewBounds() {
    this.updateBrowserViewBounds();
  }

  /**
   * Navigate a specific BrowserView to a new URL
   * 
   * @param {string} id - The BrowserView identifier
   * @param {string} url - The URL to navigate to
   * @returns {Promise<boolean>} - True if successful
   */
  async navigateBrowserView(id, url) {
    try {
      const view = this.browserViews.get(id);
      if (!view) {
        console.error(`[BrowserViewManager] BrowserView ${id} not found for navigation`);
        return false;
      }

      console.log(`[BrowserViewManager] Navigating ${id} to: ${url}`);
      await view.webContents.loadURL(url);
      return true;

    } catch (error) {
      console.error(`[BrowserViewManager] Error navigating ${id}:`, error);
      return false;
    }
  }

  /**
   * Reload a specific BrowserView
   * 
   * @param {string} id - The BrowserView identifier
   * @returns {boolean} - True if successful
   */
  reloadBrowserView(id) {
    try {
      const view = this.browserViews.get(id);
      if (!view) {
        console.error(`[BrowserViewManager] BrowserView ${id} not found for reload`);
        return false;
      }

      console.log(`[BrowserViewManager] Reloading ${id}`);
      view.webContents.reload();
      return true;

    } catch (error) {
      console.error(`[BrowserViewManager] Error reloading ${id}:`, error);
      return false;
    }
  }

  /**
   * Execute JavaScript in a specific BrowserView
   * 
   * @param {string} id - The BrowserView identifier
   * @param {string} code - The JavaScript code to execute
   * @returns {Promise<any>} - The result of the JavaScript execution
   */
  async executeJavaScript(id, code) {
    try {
      const view = this.browserViews.get(id);
      if (!view) {
        throw new Error(`BrowserView ${id} not found`);
      }

      return await view.webContents.executeJavaScript(code);

    } catch (error) {
      console.error(`[BrowserViewManager] Error executing JavaScript in ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get the current URL of a specific BrowserView
   * 
   * @param {string} id - The BrowserView identifier
   * @returns {string|null} - The current URL or null if not found
   */
  getBrowserViewURL(id) {
    const view = this.browserViews.get(id);
    return view ? view.webContents.getURL() : null;
  }

  /**
   * Get a BrowserView instance by ID
   * 
   * @param {string} id - The BrowserView identifier
   * @returns {BrowserView|null} - The BrowserView instance or null
   */
  getBrowserView(id) {
    return this.browserViews.get(id) || null;
  }

  /**
   * Get the currently active BrowserView
   * 
   * @returns {BrowserView|null} - The active BrowserView or null
   */
  getActiveBrowserView() {
    return this.activeBrowserView;
  }

  /**
   * Get all BrowserView IDs
   * 
   * @returns {Array<string>} - Array of BrowserView identifiers
   */
  getAllBrowserViewIds() {
    return Array.from(this.browserViews.keys());
  }

  /**
   * Initialize standard apps as BrowserViews
   * 
   * @param {Object} standardApps - Configuration object for standard apps
   * @returns {Promise<void>}
   */
  async initializeStandardApps(standardApps) {
    if (this.isInitialized) {
      console.log('[BrowserViewManager] Standard apps already initialized');
      return;
    }

    console.log('[BrowserViewManager] Initializing standard apps...');

    try {
      // Create BrowserViews for all visible standard apps in parallel
      const creationPromises = Object.entries(standardApps)
        .filter(([_, config]) => config.visible)
        .map(async ([id, config]) => {
          try {
            await this.createBrowserView(id, config.url, {
              title: config.title,
              isStandardApp: true
            });
            this.standardApps.set(id, config);
            console.log(`[BrowserViewManager] Initialized standard app: ${id}`);
          } catch (error) {
            console.error(`[BrowserViewManager] Failed to initialize ${id}:`, error);
          }
        });

      await Promise.all(creationPromises);
      this.isInitialized = true;
      
      console.log(`[BrowserViewManager] Successfully initialized ${this.standardApps.size} standard apps`);

    } catch (error) {
      console.error('[BrowserViewManager] Error initializing standard apps:', error);
    }
  }

  /**
   * Destroy a specific BrowserView
   * 
   * @param {string} id - The BrowserView identifier
   * @returns {boolean} - True if successful
   */
  destroyBrowserView(id) {
    try {
      const view = this.browserViews.get(id);
      if (!view) {
        console.log(`[BrowserViewManager] BrowserView ${id} not found for destruction`);
        return false;
      }

      console.log(`[BrowserViewManager] Destroying BrowserView ${id}`);

      // Remove from main window if it's the active view
      if (this.activeBrowserView === view) {
        this.mainWindow.removeBrowserView(view);
        this.activeBrowserView = null;
      }

      // Destroy the view
      view.webContents.destroy();
      this.browserViews.delete(id);
      this.standardApps.delete(id);

      return true;

    } catch (error) {
      console.error(`[BrowserViewManager] Error destroying BrowserView ${id}:`, error);
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
   * Cleanup all BrowserViews and resources
   */
  cleanup() {
    console.log('[BrowserViewManager] Cleaning up...');

    try {
      // Destroy all BrowserViews
      for (const [id, view] of this.browserViews) {
        try {
          if (this.activeBrowserView === view) {
            this.mainWindow.removeBrowserView(view);
          }
          view.webContents.destroy();
        } catch (error) {
          console.error(`[BrowserViewManager] Error destroying ${id}:`, error);
        }
      }

      // Clear collections
      this.browserViews.clear();
      this.standardApps.clear();
      this.activeBrowserView = null;
      this.isInitialized = false;

      console.log('[BrowserViewManager] Cleanup completed');

    } catch (error) {
      console.error('[BrowserViewManager] Error during cleanup:', error);
    }
  }

  /**
   * Get statistics about the BrowserViewManager
   * 
   * @returns {Object} - Statistics object
   */
  getStats() {
    return {
      totalBrowserViews: this.browserViews.size,
      standardApps: this.standardApps.size,
      activeBrowserView: this.activeBrowserView ? 'active' : 'none',
      isInitialized: this.isInitialized,
      browserViewIds: this.getAllBrowserViewIds()
    };
  }
}

module.exports = BrowserViewManager;
