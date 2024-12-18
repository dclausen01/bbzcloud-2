import React, { useState, useEffect } from 'react';
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
  const { settings, toggleButtonVisibility, addCustomApp, removeCustomApp, updateGlobalZoom, toggleAutostart } = useSettings();
  const { colorMode, toggleColorMode } = useColorMode();
  const [newAppTitle, setNewAppTitle] = useState('');
  const [newAppUrl, setNewAppUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showBBBPassword, setShowBBBPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [credentials, setCredentials] = useState({
    email: '',
    password: '',
    bbbPassword: ''
  });
  const toast = useToast();

  useEffect(() => {
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
  }, [toast]);

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

  const resetZoom = () => {
    updateGlobalZoom(1.0);
  };

  if (isLoading) {
    return (
      <VStack spacing={4} align="center" justify="center" h="100%">
        <Spinner size="xl" />
        <Text>Lade Einstellungen...</Text>
      </VStack>
    );
  }

  return (
    <VStack spacing={6} align="stretch">
      <Box>
        <Text fontSize="lg" fontWeight="bold" mb={4}>
          Allgemein
        </Text>
        <FormControl display="flex" alignItems="center" mb={4}>
          <FormLabel mb={0}>Automatisch starten</FormLabel>
          <Switch isChecked={settings.autostart} onChange={toggleAutostart} />
        </FormControl>
        <FormControl display="flex" alignItems="center">
          <FormLabel mb={0}>Dunkler Modus</FormLabel>
          <Switch isChecked={colorMode === 'dark'} onChange={toggleColorMode} />
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
        <FormControl mb={2}>
          <HStack spacing={4} align="center">
            <Box flex="1">
              <Slider
                aria-label="Zoom"
                min={0.5}
                max={2}
                step={0.1}
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
        <Button size="sm" onClick={resetZoom}>
          Zoom zurücksetzen
        </Button>
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

      <Button onClick={onClose} mt={4}>
        Schließen
      </Button>
    </VStack>
  );
}

export default SettingsPanel;
