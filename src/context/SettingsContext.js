import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const SettingsContext = createContext();

const standardApps = {
  "SchulSHPortal": {
    "id": "SchulSHPortal",
    "title": "Schul.SH Portal",
    "url": "https://portal.schule-sh.de/",
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
      url: 'https://app.schul.cloud', 
      title: 'schul.cloud',
      buttonVariant: 'schulcloud',
      zoom: 1.0
    },
    moodle: { 
      visible: true, 
      url: 'https://portal.bbz-rd-eck.com', 
      title: 'Moodle',
      buttonVariant: 'moodle',
      zoom: 1.0
    },
    bbb: { 
      visible: true, 
      url: 'https://bbb.bbz-rd-eck.de/b/signin', 
      title: 'BigBlueButton',
      buttonVariant: 'bbb',
      zoom: 1.0
    },
    outlook: {
      visible: true,
      url: 'https://exchange.bbz-rd-eck.de/owa/#path=/mail',
      title: 'Outlook',
      buttonVariant: 'blue',
      zoom: 1.0
    },
    office: {
      visible: true,
      url: 'https://m365.cloud.microsoft/?auth=2',
      title: 'Office',
      buttonVariant: 'lilac',
      zoom: 1.0
    },
    cryptpad: {
      visible: true,
      url: 'https://cryptpad.fr/drive',
      title: 'CryptPad',
      buttonVariant: 'cryptpad',
      zoom: 1.0
    },
    taskcards: {
      visible: true,
      url: 'https://bbzrdeck.taskcards.app',
      title: 'TaskCards',
      buttonVariant: 'taskcards',
      zoom: 1.0
    },
    webuntis: {
      visible: true,
      url: 'https://neilo.webuntis.com/WebUntis/?school=bbz-rd-eck#/basic/login',
      title: 'WebUntis',
      buttonVariant: 'orange',
      zoom: 1.0
    },
    fobizz: {
      visible: true,
      url: 'https://tools.fobizz.com/',
      title: 'Fobizz Tools',
      buttonVariant: 'darkred',
      zoom: 1.0
    },
    wiki: {
      visible: true,
      url: 'https://wiki.bbz-rd-eck.com',
      title: 'Intranet',
      buttonVariant: 'wiki',
      zoom: 1.0
    },
    handbook: {
      visible: true,
      url: 'https://viflow.bbz-rd-eck.de/viflow/',
      title: 'Handbuch',
      buttonVariant: 'handbook',
      zoom: 1.0
    }
  },
  standardApps: Object.values(standardApps),
  customApps: [],
  theme: 'light',
  startupDelay: 3000,
  globalZoom: 1.0,
  navbarZoom: 0.9,
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
      if (!isLoading) {
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

  // Listen for update status changes
  useEffect(() => {
    const unsubscribe = window.electron.onUpdateStatus((status) => {
      setUpdateStatus(status);
    });
    return () => unsubscribe();
  }, []);

  const value = {
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

  // Don't render children until settings are loaded
  return (
    <SettingsContext.Provider value={value}>
      {isLoading ? null : children}
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
