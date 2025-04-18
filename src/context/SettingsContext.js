import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { defaultSchoolConfig } from '../components/SchoolCustomization';

const SettingsContext = createContext();

// Use the standardApps from SchoolCustomization
const standardApps = defaultSchoolConfig.standardApps;

const defaultSettings = {
  // Use navigation buttons from SchoolCustomization
  navigationButtons: defaultSchoolConfig.navigationButtons,
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
