import React, { useState, useEffect, useCallback } from 'react';
import {
  VStack,
  FormControl,
  FormLabel,
  Switch,
  Input,
  Button,
  Divider,
  Text,
  useColorMode,
  Box,
  IconButton,
  HStack,
  useToast,
  InputGroup,
  InputRightElement,
  Spinner,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Tooltip,
} from '@chakra-ui/react';
import { useSettings } from '../context/SettingsContext';

function SettingsPanel({ onClose }) {
  const { settings, toggleButtonVisibility, addCustomApp, removeCustomApp, updateGlobalZoom, updateNavbarZoom, toggleAutostart, toggleMinimizedStart, toggleDarkMode, updateSettings } = useSettings();
  const { setColorMode } = useColorMode();
  const [newAppTitle, setNewAppTitle] = useState('');
  const [newAppUrl, setNewAppUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showBBBPassword, setShowBBBPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dbPath, setDbPath] = useState('');
  const [credentials, setCredentials] = useState({
    email: '',
    password: '',
    bbbPassword: ''
  });
  const [version, setVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState('');
  const toast = useToast();

  useEffect(() => {
    // Listen for update status
    const unsubscribe = window.electron.onUpdateStatus((status) => {
      setUpdateStatus(status);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Load version
    const loadVersion = async () => {
      try {
        const ver = await window.electron.getVersion();
        setVersion(ver);
      } catch (error) {
        console.error('Error loading version:', error);
        toast({
          title: 'Fehler beim Laden der Version',
          description: error.message,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    };
    loadVersion();

    // Load credentials
    const loadCredentials = async () => {
      setIsLoading(true);
      try {
        const emailResult = await window.electron.getCredentials({ 
          service: 'bbzcloud', 
          account: 'email' 
        });
        const passwordResult = await window.electron.getCredentials({ 
          service: 'bbzcloud', 
          account: 'password' 
        });
        const bbbPasswordResult = await window.electron.getCredentials({ 
          service: 'bbzcloud', 
          account: 'bbbPassword' 
        });
        
        setCredentials({
          email: emailResult.success ? emailResult.password : '',
          password: passwordResult.success ? passwordResult.password : '',
          bbbPassword: bbbPasswordResult.success ? bbbPasswordResult.password : ''
        });
      } catch (error) {
        console.error('Error loading credentials:', error);
        toast({
          title: 'Fehler beim Laden der Zugangsdaten',
          description: error.message,
          status: 'error',
          duration: 5000,
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadCredentials();
    
    // Load database path
    const loadDbPath = async () => {
      try {
        const path = await window.electron.getDatabasePath();
        setDbPath(path);
      } catch (error) {
        console.error('Error loading database path:', error);
      }
    };
    loadDbPath();

    // No need for database change listener since settings are managed by context
    return () => {};
  }, [toast]);

  const handleChangeDatabaseLocation = useCallback(async () => {
    try {
      const result = await window.electron.changeDatabaseLocation();
      if (result.success) {
        setDbPath(result.path);
        
        // Reload settings from new database location
        const settingsResult = await window.electron.getSettings();
        if (settingsResult.success && settingsResult.settings) {
          updateSettings(settingsResult.settings);
        }
        
        toast({
          title: 'Datenbank-Speicherort geändert',
          description: 'Einstellungen wurden neu geladen',
          status: 'success',
          duration: 3000,
        });
      }
    } catch (error) {
      toast({
        title: 'Fehler beim Ändern des Speicherorts',
        description: error.message,
        status: 'error',
        duration: 5000,
      });
    }
  }, [toast, updateSettings]);

  const handleSaveCredentials = async () => {
    setIsSaving(true);
    try {
      const results = await Promise.all([
        credentials.email ? window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'email',
          password: credentials.email
        }) : Promise.resolve({ success: true }),
        credentials.password ? window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'password',
          password: credentials.password
        }) : Promise.resolve({ success: true }),
        credentials.bbbPassword ? window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'bbbPassword',
          password: credentials.bbbPassword
        }) : Promise.resolve({ success: true })
      ]);

      const allSuccessful = results.every(result => result.success);
      
      if (allSuccessful) {
        toast({
          title: 'Zugangsdaten gespeichert',
          status: 'success',
          duration: 3000,
        });
      } else {
        throw new Error('Einige Zugangsdaten konnten nicht gespeichert werden');
      }
    } catch (error) {
      toast({
        title: 'Fehler beim Speichern',
        description: error.message,
        status: 'error',
        duration: 5000,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCustomApp = async () => {
    if (!newAppTitle || !newAppUrl) {
      toast({
        title: 'Fehler',
        description: 'Bitte geben Sie einen Titel und eine URL ein',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    let url = newAppUrl;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    try {
      await addCustomApp({
        id: Date.now().toString(),
        title: newAppTitle,
        url: url,
      });

      setNewAppTitle('');
      setNewAppUrl('');

      toast({
        title: 'Erfolg',
        description: 'Benutzerdefinierte App hinzugefügt',
        status: 'success',
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: 'Fehler beim Hinzufügen',
        description: error.message,
        status: 'error',
        duration: 5000,
      });
    }
  };

  const handleRemoveCustomApp = async (appId) => {
    try {
      await removeCustomApp(appId);
      toast({
        title: 'App entfernt',
        status: 'success',
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: 'Fehler beim Entfernen',
        description: error.message,
        status: 'error',
        duration: 5000,
      });
    }
  };

  const handleGlobalZoomChange = (value) => {
    updateGlobalZoom(value);
  };

  const handleNavbarZoomChange = (value) => {
    updateNavbarZoom(value);
  };

  const resetZoom = () => {
    updateGlobalZoom(1.0);
    updateNavbarZoom(1.0);
  };

  if (isLoading) {
    return (
      <VStack spacing={4} align="center" justify="center" h="100%">
        <Spinner size="xl" />
        <Text>Lade Einstellungen...</Text>
      </VStack>
    );
  }

  // Ensure settings object exists to prevent errors
  if (!settings) {
    return (
      <VStack spacing={4} align="center" justify="center" h="100%">
        <Text>Fehler beim Laden der Einstellungen</Text>
        <Button onClick={onClose}>Schließen</Button>
      </VStack>
    );
  }

  return (
    <VStack spacing={6} align="stretch">
      {version && (
        <Box fontSize="sm" color="gray.500" mb={-4}>
          <HStack justify="space-between">
            <Text>
              <a href="https://wiki.bbz-rd-eck.com/doku.php?id=anleitungen_allgemein:bbzcloudapp" target="_blank" rel="noopener noreferrer" style={{textDecoration: 'underline'}}>
                ❓ Hilfe
              </a>
            </Text>
            <Text>
              Version {version} • <a href="https://github.com/dclausen01/bbzcloud-2/" target="_blank" rel="noopener noreferrer" style={{textDecoration: 'underline'}}>GitHub</a>
              {updateStatus && (
                <Text as="span" ml={2}>
                  • {updateStatus}
                  {updateStatus.includes('heruntergeladen') && (
                    <Button
                      size="sm"
                      colorScheme="green"
                      ml={2}
                      onClick={() => window.electron.installUpdate()}
                    >
                      Update installieren
                    </Button>
                  )}
                </Text>
              )}
            </Text>
          </HStack>
        </Box>
      )}
      <Box>
        <Text fontSize="lg" fontWeight="bold" mb={4}>
          Allgemein
        </Text>
        <FormControl display="flex" alignItems="center" mb={4}>
          <FormLabel mb={0}>Automatisch starten</FormLabel>
          <Switch isChecked={settings.autostart} onChange={toggleAutostart} />
        </FormControl>
        <FormControl display="flex" alignItems="center" mb={4}>
          <FormLabel mb={0}>Anwendung immer minimiert starten</FormLabel>
          <Switch isChecked={settings.minimizedStart} onChange={toggleMinimizedStart} />
        </FormControl>
        <FormControl display="flex" alignItems="center">
          <FormLabel mb={0}>Dunkler Modus</FormLabel>
          <Switch 
            isChecked={settings.theme === 'dark'} 
            onChange={() => {
              toggleDarkMode();
              setColorMode(settings.theme === 'dark' ? 'light' : 'dark');
            }} 
          />
        </FormControl>
      </Box>

      <Divider />

      <Box>
        <Text fontSize="lg" fontWeight="bold" mb={4}>
          Navigationsbuttons
        </Text>
        {Object.entries(settings.navigationButtons).map(([id, config]) => (
          <FormControl key={id} mb={4}>
            <HStack justify="space-between">
              <FormLabel mb={0}>{config.title}</FormLabel>
              <Switch
                isChecked={config.visible}
                onChange={() => toggleButtonVisibility(id)}
              />
            </HStack>
          </FormControl>
        ))}
      </Box>

      <Divider />

      <Box>
        <Text fontSize="lg" fontWeight="bold" mb={4}>
          Zoom
        </Text>
        <VStack spacing={4} align="stretch">
          <Box>
            <FormLabel mb={2}>Webseiten Zoom</FormLabel>
            <FormControl mb={2}>
              <HStack spacing={4} align="center">
                <Box flex="1">
                  <Slider
                    aria-label="Webseiten Zoom"
                    min={0.25}
                    max={4}
                    step={0.05}
                    value={settings.globalZoom}
                    onChange={handleGlobalZoomChange}
                  >
                    <SliderTrack>
                      <SliderFilledTrack />
                    </SliderTrack>
                    <Tooltip 
                      label={`${Math.round(settings.globalZoom * 100)}%`} 
                      placement="top" 
                      isOpen={true}
                    >
                      <SliderThumb />
                    </Tooltip>
                  </Slider>
                </Box>
                <Text minW="45px" textAlign="right">
                  {Math.round(settings.globalZoom * 100)}%
                </Text>
              </HStack>
            </FormControl>
          </Box>

          <Box>
            <FormLabel mb={2}>Navigationsleiste Zoom</FormLabel>
            <FormControl mb={2}>
              <HStack spacing={4} align="center">
                <Box flex="1">
                  <Slider
                    aria-label="Navigationsleiste Zoom"
                    min={0.7}
                    max={1.2}
                    step={0.05}
                    value={Math.min(Math.max(settings.navbarZoom, 0.7), 1.2)}
                    onChange={handleNavbarZoomChange}
                  >
                    <SliderTrack>
                      <SliderFilledTrack />
                    </SliderTrack>
                    <Tooltip 
                      label={`${Math.round(settings.navbarZoom * 100)}%`} 
                      placement="top" 
                      isOpen={true}
                    >
                      <SliderThumb />
                    </Tooltip>
                  </Slider>
                </Box>
                <Text minW="45px" textAlign="right">
                  {Math.round(settings.navbarZoom * 100)}%
                </Text>
              </HStack>
            </FormControl>
          </Box>

          <Button size="sm" onClick={resetZoom}>
            Zoom zurücksetzen
          </Button>
        </VStack>
      </Box>

      <Divider />

      <Box>
        <Text fontSize="lg" fontWeight="bold" mb={4}>
          Zugangsdaten
        </Text>
        <VStack spacing={4}>
          <FormControl>
            <FormLabel>E-Mail-Adresse</FormLabel>
            <Input
              type="email"
              value={credentials.email}
              onChange={(e) => setCredentials(prev => ({ ...prev, email: e.target.value }))}
              placeholder="beispiel@bbz-rd-eck.de"
            />
          </FormControl>

          <FormControl>
            <FormLabel>Passwort</FormLabel>
            <InputGroup>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={credentials.password}
                onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Passwort"
              />
              <InputRightElement width="4.5rem">
                <Button h="1.75rem" size="sm" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? 'Verbergen' : 'Zeigen'}
                </Button>
              </InputRightElement>
            </InputGroup>
          </FormControl>

          <FormControl>
            <FormLabel>Passwort für BigBlueButton</FormLabel>
            <InputGroup>
              <Input
                type={showBBBPassword ? 'text' : 'password'}
                value={credentials.bbbPassword}
                onChange={(e) => setCredentials(prev => ({ ...prev, bbbPassword: e.target.value }))}
                placeholder="BBB Passwort"
              />
              <InputRightElement width="4.5rem">
                <Button h="1.75rem" size="sm" onClick={() => setShowBBBPassword(!showBBBPassword)}>
                  {showBBBPassword ? 'Verbergen' : 'Zeigen'}
                </Button>
              </InputRightElement>
            </InputGroup>
          </FormControl>

          <Button 
            colorScheme="blue" 
            onClick={handleSaveCredentials}
            isLoading={isSaving}
            loadingText="Speichere..."
          >
            Zugangsdaten speichern
          </Button>
        </VStack>
      </Box>

      <Divider />

      <Box>
        <Text fontSize="lg" fontWeight="bold" mb={4}>
          Benutzerdefinierte Apps
        </Text>
        <VStack spacing={4} align="stretch">
          {settings.customApps?.map((app) => (
            <HStack key={app.id} justify="space-between">
              <Text>{app.title}</Text>
              <IconButton
                aria-label="App entfernen"
                icon={<span>🗑️</span>}
                size="sm"
                onClick={() => handleRemoveCustomApp(app.id)}
              />
            </HStack>
          ))}

          <FormControl>
            <FormLabel>Neuer App-Titel</FormLabel>
            <Input
              value={newAppTitle}
              onChange={(e) => setNewAppTitle(e.target.value)}
              placeholder="App-Titel eingeben"
            />
          </FormControl>

          <FormControl>
            <FormLabel>Neue App-URL</FormLabel>
            <Input
              value={newAppUrl}
              onChange={(e) => setNewAppUrl(e.target.value)}
              placeholder="App-URL eingeben"
            />
          </FormControl>

          <Button onClick={handleAddCustomApp} colorScheme="blue">
            Benutzerdefinierte App hinzufügen
          </Button>
        </VStack>
      </Box>

      <Divider />

      <Box>
        <Text fontSize="lg" fontWeight="bold" mb={4}>
          Datenbank-Einstellungen
        </Text>
        <VStack spacing={4} align="stretch">
          <FormControl>
            <FormLabel>Aktueller Speicherort</FormLabel>
            <Input value={dbPath} isReadOnly />
          </FormControl>

          <Button onClick={handleChangeDatabaseLocation}>
            Speicherort ändern
          </Button>

        </VStack>
      </Box>

      <Divider />

      <Box>
        <Text fontSize="lg" fontWeight="bold" mb={4}>
          Feedback / Problem melden
        </Text>
        <VStack spacing={4} align="stretch">
          <FormControl>
            <FormLabel>Titel</FormLabel>
            <Input
              placeholder="Kurze Beschreibung des Problems oder Feedback"
              id="feedback-title"
            />
          </FormControl>

          <FormControl>
            <FormLabel>Beschreibung</FormLabel>
            <Input
              as="textarea"
              placeholder="Detaillierte Beschreibung..."
              minHeight="100px"
              id="feedback-body"
            />
          </FormControl>

          <Button
            colorScheme="blue"
            onClick={async () => {
              const title = document.getElementById('feedback-title').value;
              const body = document.getElementById('feedback-body').value;
              
              if (!title || !body) {
                toast({
                  title: 'Fehler',
                  description: 'Bitte füllen Sie alle Felder aus',
                  status: 'error',
                  duration: 3000,
                });
                return;
              }

              try {
                const result = await window.electron.createGithubIssue({ title, body });
                if (result.success) {
                  toast({
                    title: 'Email-Client geöffnet',
                    description: 'Bitte senden Sie die vorbereitete Email ab, um Ihr Feedback zu übermitteln.',
                    status: 'success',
                    duration: 5000,
                  });
                  // Clear form
                  document.getElementById('feedback-title').value = '';
                  document.getElementById('feedback-body').value = '';
                } else {
                  throw new Error(result.error);
                }
              } catch (error) {
                toast({
                  title: 'Fehler beim Senden',
                  description: error.message,
                  status: 'error',
                  duration: 5000,
                });
              }
            }}
          >
            Feedback senden
          </Button>
        </VStack>
      </Box>

      <Button onClick={onClose} mt={4}>
        Schließen
      </Button>
    </VStack>
  );
}

export default SettingsPanel;
