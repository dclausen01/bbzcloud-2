import React, { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext();

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
    wiki: {
      visible: true,
      url: 'https://wiki.bbz-rd-eck.com',
      title: 'BBZ Wiki',
      buttonVariant: 'wiki',
      zoom: 1.0
    },
    handbook: {
      visible: true,
      url: 'https://viflow.bbz-rd-eck.de/viflow/',
      title: 'BBZ Handbuch',
      buttonVariant: 'handbook',
      zoom: 1.0
    }
  },
  customApps: [],
  theme: 'light',
  startupDelay: 3000,
  globalZoom: 1.0
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from electron-store on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await window.electron.getSettings();
        if (result.success && result.settings) {
          // Ensure all default buttons exist in stored settings
          const updatedNavigationButtons = {
            ...defaultSettings.navigationButtons,
            ...result.settings.navigationButtons,
          };

          // Load stored settings but keep default values as fallback
          setSettings(prevSettings => ({
            ...defaultSettings,
            ...result.settings,
            navigationButtons: updatedNavigationButtons,
            // Ensure customApps is always an array
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
    };

    loadSettings();
  }, []);

  // Save settings whenever they change
  useEffect(() => {
    const saveSettings = async () => {
      if (!isLoading) {
        try {
          const result = await window.electron.saveSettings(settings);
          if (!result.success) {
            console.error('Failed to save settings:', result.error);
          }
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
      // Update global zoom and sync all navigation buttons and custom apps to use the same zoom
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
      // Ensure customApps is an array
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

  const value = {
    settings,
    updateSettings,
    toggleButtonVisibility,
    updateGlobalZoom,
    addCustomApp,
    removeCustomApp,
    isLoading
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
