import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { URLS, ZOOM_CONFIG } from '../utils/constants';

const SettingsContext = createContext();

const standardApps = {
  "SchulSHPortal": {
    "id": "SchulSHPortal",
    "title": "Schul.SH Portal",
    "url": "https://portal.schule-sh.de/",
    "buttonVariant": "solid"
  },
  "BBZHandbuch": {
    "id": "Handbuch",
    "title": "Handbuch",
    "url": "https://viflow.bbz-rd-eck.de/viflow/",
    "buttonVariant": "solid"
  },
  "Hubbs": {
    "id": "Hubbs",
    "title": "Hubbs",
    "url": "https://hubbs.schule/",
    "buttonVariant": "solid"
  },
    "BiBox": {
    "id": "BiBox",
    "title": "BiBox",
    "url": "https://bibox2.westermann.de/",
    "buttonVariant": "solid"
  },
  "RAABits": {
    "id": "RAABits",
    "title": "RAABits",
    "url": "https://www.raabits.de/",
    "buttonVariant": "solid"
  },
  "OneNote": {
    "id": "OneNote",
    "title": "OneNote",
    "url": "https://www.onenote.com/notebooks?auth=2&nf=1",
    "buttonVariant": "solid"
  },
  "Oncoo": {
    "id": "Oncoo",
    "title": "Oncoo",
    "url": "https://www.oncoo.de/",
    "buttonVariant": "solid"
  },
  "Miro": {
    "id": "Miro",
    "title": "Miro",
    "url": "https://miro.com/app/dashboard/",
    "buttonVariant": "solid"
  },
  "Digiscreen": {
    "id": "Digiscreen",
    "title": "Digiscreen",
    "url": "https://ladigitale.dev/digiscreen/",
    "buttonVariant": "solid"
  },
  "ClassroomScreen": {
    "id": "ClassroomScreen",
    "title": "ClassroomScreen",
    "url": "https://classroomscreen.com/app/screen/",
    "buttonVariant": "solid"
  },
  "PlagScan": {
    "id": "PlagScan",
    "title": "PlagScan",
    "url": "https://my.plagaware.com/dashboard",
    "buttonVariant": "solid"
  },
  "ExcaliDraw": {
    "id": "ExcaliDraw",
    "title": "ExcaliDraw",
    "url": "https://excalidraw.com/",
    "buttonVariant": "solid"
  },
  "KurzeLinks": {
    "id": "KurzeLinks",
    "title": "Kurze Links",
    "url": "https://kurzelinks.de",
    "buttonVariant": "solid"
  }
};

const defaultSettings = {
  navigationButtons: {
    schulcloud: { 
      visible: true, 
      url: URLS.SCHULCLOUD, 
      title: 'schul.cloud',
      buttonVariant: 'schulcloud',
      zoom: ZOOM_CONFIG.DEFAULT_ZOOM
    },
    moodle: { 
      visible: true, 
      url: URLS.MOODLE, 
      title: 'Moodle',
      buttonVariant: 'moodle',
      zoom: ZOOM_CONFIG.DEFAULT_ZOOM
    },
    bbb: { 
      visible: true, 
      url: URLS.BBB_SIGNIN, 
      title: 'BigBlueButton',
      buttonVariant: 'bbb',
      zoom: ZOOM_CONFIG.DEFAULT_ZOOM
    },
    outlook: {
      visible: true,
      url: URLS.OUTLOOK,
      title: 'Outlook',
      buttonVariant: 'blue',
      zoom: ZOOM_CONFIG.DEFAULT_ZOOM
    },
    office: {
      visible: true,
      url: URLS.OFFICE,
      title: 'Office',
      buttonVariant: 'lilac',
      zoom: ZOOM_CONFIG.DEFAULT_ZOOM
    },
    cryptpad: {
      visible: true,
      url: URLS.CRYPTPAD,
      title: 'CryptPad',
      buttonVariant: 'cryptpad',
      zoom: ZOOM_CONFIG.DEFAULT_ZOOM
    },
    taskcards: {
      visible: true,
      url: URLS.TASKCARDS,
      title: 'TaskCards',
      buttonVariant: 'taskcards',
      zoom: ZOOM_CONFIG.DEFAULT_ZOOM
    },
    webuntis: {
      visible: true,
      url: URLS.WEBUNTIS,
      title: 'WebUntis',
      buttonVariant: 'orange',
      zoom: ZOOM_CONFIG.DEFAULT_ZOOM
    },
    fobizz: {
      visible: true,
      url: URLS.FOBIZZ,
      title: 'Fobizz Tools',
      buttonVariant: 'darkred',
      zoom: ZOOM_CONFIG.DEFAULT_ZOOM
    },
    wiki: {
      visible: true,
      url: URLS.WIKI,
      title: 'Intranet',
      buttonVariant: 'wiki',
      zoom: ZOOM_CONFIG.DEFAULT_ZOOM
    },
    antraege: {
      visible: true,
      url: URLS.ANTRAEGE,
      title: 'Anträge',
      buttonVariant: 'handbook',
      zoom: ZOOM_CONFIG.DEFAULT_ZOOM
    }
  },
  standardApps: Object.values(standardApps),
  customApps: [],
  theme: 'light',
  startupDelay: 3000,
  globalZoom: ZOOM_CONFIG.DEFAULT_ZOOM,
  navbarZoom: ZOOM_CONFIG.DEFAULT_NAVBAR_ZOOM,
  autostart: true,
  minimizedStart: false
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [customApps, setCustomApps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updateStatus, setUpdateStatus] = useState('');

  // Function to load custom apps
  const loadCustomApps = useCallback(async () => {
    if (!window.electron) {
      console.warn('Electron API not available, using default custom apps');
      return;
    }
    try {
      const result = await window.electron.getCustomApps();
      if (result.success) {
        setCustomApps(result.apps);
      }
    } catch (error) {
      console.error('Failed to load custom apps:', error);
    }
  }, []);

  // Function to load settings that can be called from outside
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    if (!window.electron) {
      console.warn('Electron API not available, using default settings');
      setIsLoading(false);
      return;
    }
    try {
      const result = await window.electron.getSettings();
      if (result.success && result.settings) {
        // Start with default settings
        const newSettings = { ...defaultSettings };

        // Merge navigation buttons while preserving hardcoded titles and defaults
        const updatedNavigationButtons = Object.entries(defaultSettings.navigationButtons).reduce((acc, [key, defaultButton]) => {
          const savedButton = result.settings.navigationButtons?.[key] || {};
          return {
            ...acc,
            [key]: {
              ...defaultButton,
              ...savedButton,
              // Preserve the hardcoded title and ensure visible property exists
              title: defaultButton.title,
              visible: savedButton.visible ?? defaultButton.visible
            }
          };
        }, {});

        // Update settings with loaded data and ensure all required properties exist
        setSettings({
          ...newSettings,
          navigationButtons: updatedNavigationButtons,
          standardApps: defaultSettings.standardApps,
          customApps: Array.isArray(result.settings.customApps) 
            ? result.settings.customApps 
            : [],
          theme: result.settings.theme || defaultSettings.theme,
          globalZoom: result.settings.globalZoom || defaultSettings.globalZoom,
          navbarZoom: result.settings.navbarZoom || defaultSettings.navbarZoom,
          autostart: result.settings.autostart ?? defaultSettings.autostart,
          minimizedStart: result.settings.minimizedStart ?? defaultSettings.minimizedStart
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load and database change handler
  useEffect(() => {
    const init = async () => {
      await loadSettings();
      await loadCustomApps();
    };
    init();

    if (!window.electron) {
      return;
    }

    const handleDatabaseChange = async () => {
      console.log('Database changed, reloading data...');
      await loadSettings();
      await loadCustomApps();
      console.log('Data successfully reloaded after database change');
    };
    
    window.electron.on('database-changed', handleDatabaseChange);
    
    return () => {
      window.electron.off('database-changed', handleDatabaseChange);
    };
  }, [loadSettings, loadCustomApps]);

  useEffect(() => {
    const saveSettings = async () => {
      if (!isLoading && window.electron) {
        try {
          const result = await window.electron.saveSettings(settings);
          if (!result.success) {
            console.error('Failed to save settings:', result.error);
          }
          // Don't call setAutostart here as it's already handled by saveSettings
          // and calling it separately can cause settings to be overwritten
        } catch (error) {
          console.error('Error saving settings:', error);
        }
      }
    };

    saveSettings();
  }, [settings, isLoading]);

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => {
    const updateSettings = (newSettings) => {
      setSettings(prevSettings => ({
        ...prevSettings,
        ...newSettings
      }));
    };

    const toggleButtonVisibility = (buttonId) => {
      setSettings(prevSettings => ({
        ...prevSettings,
        navigationButtons: {
          ...prevSettings.navigationButtons,
          [buttonId]: {
            ...prevSettings.navigationButtons[buttonId],
            visible: !prevSettings.navigationButtons[buttonId].visible
          }
        }
      }));
    };

    const updateGlobalZoom = (zoom) => {
      setSettings(prevSettings => {
        const updatedNavigationButtons = Object.entries(prevSettings.navigationButtons).reduce((acc, [id, config]) => ({
          ...acc,
          [id]: {
            ...config,
            zoom: zoom
          }
        }), {});

        const updatedCustomApps = prevSettings.customApps.map(app => ({
          ...app,
          zoom: zoom
        }));

        return {
          ...prevSettings,
          globalZoom: zoom,
          navigationButtons: updatedNavigationButtons,
          customApps: updatedCustomApps
        };
      });
    };

    const addCustomApp = async (app) => {
      if (!window.electron) {
        console.warn('Electron API not available, cannot add custom app');
        return;
      }
      try {
        const result = await window.electron.saveCustomApps([
          ...customApps,
          {
            ...app,
            buttonVariant: 'solid',
            zoom: settings.globalZoom
          }
        ]);
        if (result.success) {
          await loadCustomApps();
        }
      } catch (error) {
        console.error('Failed to add custom app:', error);
        throw error;
      }
    };

    const removeCustomApp = async (appId) => {
      if (!window.electron) {
        console.warn('Electron API not available, cannot remove custom app');
        return;
      }
      try {
        const result = await window.electron.saveCustomApps(
          customApps.filter(app => app.id !== appId)
        );
        if (result.success) {
          await loadCustomApps();
        }
      } catch (error) {
        console.error('Failed to remove custom app:', error);
        throw error;
      }
    };

    const toggleAutostart = () => {
      setSettings(prevSettings => ({
        ...prevSettings,
        autostart: !prevSettings.autostart
      }));
    };

    const toggleMinimizedStart = () => {
      setSettings(prevSettings => ({
        ...prevSettings,
        minimizedStart: !prevSettings.minimizedStart
      }));
    };

    const toggleDarkMode = () => {
      setSettings(prevSettings => ({
        ...prevSettings,
        theme: prevSettings.theme === 'dark' ? 'light' : 'dark'
      }));
    };

    const updateNavbarZoom = (zoom) => {
      setSettings(prevSettings => ({
        ...prevSettings,
        navbarZoom: zoom
      }));
    };

    return {
      settings: { ...settings, customApps },
      updateSettings,
      toggleButtonVisibility,
      updateGlobalZoom,
      addCustomApp,
      removeCustomApp,
      toggleAutostart,
      toggleMinimizedStart,
      isLoading,
      toggleDarkMode,
      updateNavbarZoom,
      updateStatus
    };
  }, [
    settings,
    customApps,
    isLoading,
    updateStatus,
    loadCustomApps
  ]);

  // Listen for update status changes
  useEffect(() => {
    if (!window.electron) {
      return;
    }
    const unsubscribe = window.electron.onUpdateStatus((status) => {
      setUpdateStatus(status);
    });
    return () => unsubscribe();
  }, []);

  // Don't render children until settings are loaded
  return (
    <SettingsContext.Provider value={value}>
      {isLoading ? (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          fontSize: '18px',
          color: '#666'
        }}>
          Loading BBZCloud...
        </div>
      ) : children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
