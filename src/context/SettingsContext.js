import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const SettingsContext = createContext();

const standardApps = {
  "SchulSHPortal": {
    "id": "SchulSHPortal",
    "title": "Schul.SH Portal",
    "url": "https://portal.schule-sh.de/univention/portal/",
    "buttonVariant": "solid"
  },
  "Hubbs": {
    "id": "Hubbs",
    "title": "Hubbs",
    "url": "https://hubbs.schule/",
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
      url: 'https://www.microsoft365.com/?auth=2',
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
      title: 'Wiki',
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
  autostart: true,
  minimizedStart: false
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  // Function to load settings that can be called from outside
  const loadSettings = useCallback(async () => {
    try {
      const result = await window.electron.getSettings();
      if (result.success && result.settings) {
        // Merge navigation buttons while preserving hardcoded titles
        const updatedNavigationButtons = Object.entries(defaultSettings.navigationButtons).reduce((acc, [key, defaultButton]) => {
          const savedButton = result.settings.navigationButtons?.[key] || {};
          return {
            ...acc,
            [key]: {
              ...defaultButton,
              ...savedButton,
              // Preserve the hardcoded title
              title: defaultButton.title
            }
          };
        }, {});

        setSettings(prevSettings => ({
          ...defaultSettings,
          ...result.settings,
          navigationButtons: updatedNavigationButtons,
          standardApps: defaultSettings.standardApps,
          customApps: Array.isArray(result.settings.customApps) 
            ? result.settings.customApps 
            : [],
        }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load and database change handler
  useEffect(() => {
    loadSettings();

    const handleDatabaseChange = () => {
      loadSettings();
      console.log('Settings reloaded after database change');
    };
    
    window.electron.on('database-changed', handleDatabaseChange);
    
    return () => {
      window.electron.off('database-changed', handleDatabaseChange);
    };
  }, [loadSettings]);

  useEffect(() => {
    const saveSettings = async () => {
      if (!isLoading) {
        try {
          const result = await window.electron.saveSettings(settings);
          if (!result.success) {
            console.error('Failed to save settings:', result.error);
          }
          await window.electron.setAutostart(settings.autostart);
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

  const addCustomApp = (app) => {
    setSettings(prevSettings => {
      const currentCustomApps = Array.isArray(prevSettings.customApps) 
        ? prevSettings.customApps 
        : [];

      return {
        ...prevSettings,
        customApps: [...currentCustomApps, {
          ...app,
          buttonVariant: 'solid',
          zoom: prevSettings.globalZoom
        }]
      };
    });
  };

  const removeCustomApp = (appId) => {
    setSettings(prevSettings => ({
      ...prevSettings,
      customApps: prevSettings.customApps.filter(app => app.id !== appId)
    }));
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

  const value = {
    settings,
    updateSettings,
    toggleButtonVisibility,
    updateGlobalZoom,
    addCustomApp,
    removeCustomApp,
    toggleAutostart,
    toggleMinimizedStart,
    isLoading,
    toggleDarkMode
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
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
