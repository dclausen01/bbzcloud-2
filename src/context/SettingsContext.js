import React, { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext();

const defaultSettings = {
  navigationButtons: {
    schulcloud: { 
      visible: true, 
      url: 'https://app.schul.cloud', 
      title: 'schul.cloud',
      buttonVariant: 'schulcloud'
    },
    moodle: { 
      visible: true, 
      url: 'https://portal.bbz-rd-eck.com', 
      title: 'Moodle',
      buttonVariant: 'moodle'
    },
    bbb: { 
      visible: true, 
      url: 'https://bbb.bbz-rd-eck.de', 
      title: 'BigBlueButton',
      buttonVariant: 'bbb'
    },
    taskcards: {
      visible: true,
      url: 'https://bbzrdeck.taskcards.app',
      title: 'TaskCards',
      buttonVariant: 'taskcards'
    },
    cryptpad: {
      visible: true,
      url: 'https://cryptpad.fr/drive',
      title: 'CryptPad',
      buttonVariant: 'cryptpad'
    },
    wiki: {
      visible: true,
      url: 'https://wiki.bbz-rd-eck.com',
      title: 'BBZ Wiki',
      buttonVariant: 'wiki'
    },
    handbook: {
      visible: true,
      url: 'https://viflow.bbz-rd-eck.de/viflow',
      title: 'BBZ Handbuch',
      buttonVariant: 'handbook'
    }
  },
  customApps: [],
  theme: 'light',
  startupDelay: 3000,
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
          favicon: `https://www.google.com/s2/favicons?domain=${new URL(app.url).hostname}&sz=32`
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
