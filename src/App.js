import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Flex,
  IconButton,
  useColorMode,
  useDisclosure,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  Image,
  Tooltip,
  Text,
  useToast,
  ButtonGroup,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  FormControl,
  FormLabel,
  Input,
  Button,
} from '@chakra-ui/react';
import { useSettings } from './context/SettingsContext';
import NavigationBar from './components/NavigationBar';
import WebViewContainer from './components/WebViewContainer';
import SettingsPanel from './components/SettingsPanel';
import CustomAppsMenu from './components/CustomAppsMenu';

function App() {
  const { setColorMode } = useColorMode();
  const { settings } = useSettings();
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState('');
  const [isLoadingEmail, setIsLoadingEmail] = useState(true);

  useEffect(() => {
    setColorMode(settings.theme);
  }, [settings.theme, setColorMode]);

  useEffect(() => {
    const loadEmail = async () => {
      try {
        const result = await window.electron.getCredentials({
          service: 'bbzcloud',
          account: 'email'
        });
        if (result.success && result.password) {
          setEmail(result.password);
        } else {
          setShowEmailModal(true);
        }
      } catch (error) {
        console.error('Error loading email:', error);
      } finally {
        setIsLoadingEmail(false);
      }
    };
    loadEmail();
  }, []);

  const handleEmailSubmit = async () => {
    if (!email) return;
    
    try {
      await window.electron.saveCredentials({
        service: 'bbzcloud',
        account: 'email',
        password: email
      });
      setShowEmailModal(false);
    } catch (error) {
      console.error('Error saving email:', error);
      toast({
        title: 'Fehler beim Speichern',
        description: error.message,
        status: 'error',
        duration: 5000,
      });
    }
  };

  const filterNavigationButtons = useCallback(() => {
    if (!settings.navigationButtons) return {};

    const isTeacher = email.endsWith('@bbz-rd-eck.de');
    const isStudent = email.endsWith('@sus.bbz-rd-eck.de');

    if (isTeacher) {
      return settings.navigationButtons;
    }

    const allowedApps = ['schulcloud', 'moodle', 'office', 'cryptpad', 'webuntis', 'wiki'];
    return Object.entries(settings.navigationButtons)
      .filter(([key]) => allowedApps.includes(key))
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
  }, [email, settings.navigationButtons]);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [activeWebView, setActiveWebView] = useState(null);
  const webViewRef = useRef(null);
  const [appIconPath, setAppIconPath] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const toast = useToast();

  useEffect(() => {
    const loadAppIcon = async () => {
      try {
        const iconPath = await window.electron.getAssetPath('icon.png');
        setAppIconPath(iconPath);
      } catch (error) {
        console.error('Fehler beim Laden des App-Icons:', error);
      }
    };
    loadAppIcon();
  }, []);

  useEffect(() => {
    if (!activeWebView && settings.navigationButtons) {
      const filteredButtons = filterNavigationButtons();
      const firstVisibleApp = Object.entries(filteredButtons)
        .find(([_, config]) => config.visible);
      
      if (firstVisibleApp) {
        const [id, config] = firstVisibleApp;
        setActiveWebView({
          id,
          url: config.url,
          title: config.title,
        });
        setCurrentUrl(config.url);
      }
    }
  }, [settings.navigationButtons, activeWebView, filterNavigationButtons]);

  const handleNavigationClick = (buttonId) => {
    const filteredButtons = filterNavigationButtons();
    const buttonConfig = filteredButtons[buttonId];
    if (buttonConfig) {
      setActiveWebView({
        id: buttonId,
        url: buttonConfig.url,
        title: buttonConfig.title,
      });
      setCurrentUrl(buttonConfig.url);
    }
  };

  const handleCustomAppClick = (app) => {
    setActiveWebView({
      id: app.id,
      url: app.url,
      title: app.title,
    });
    setCurrentUrl(app.url);
  };

  const handleOpenInNewWindow = (url, title) => {
    window.electron.openExternalWindow({ url, title });
  };

  const handleWebViewNavigation = (action) => {
    if (webViewRef.current) {
      webViewRef.current[action]();
    }
  };

  const handleCopyUrl = () => {
    if (currentUrl) {
      navigator.clipboard.writeText(currentUrl);
      toast({
        title: 'Link kopiert',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    }
  };

  const filteredNavigationButtons = filterNavigationButtons();

  return (
    <Box h="100vh" display="flex" flexDirection="column" overflow="hidden">
      <Flex
        as="header"
        align="center"
        p={2}
        borderBottom="1px"
        borderColor={settings.theme === 'light' ? 'gray.200' : 'gray.700'}
      >
        {/* Left section */}
        <Flex minW="fit-content" justify="flex-start" align="center">
          {appIconPath && (
            <Image
              src={`file://${appIconPath}`}
              alt="BBZCloud Logo"
              height="28px"
              width="28px"
              objectFit="contain"
              mr={2}
              cursor="pointer"
              onClick={() => handleOpenInNewWindow('https://www.bbz-rd-eck.de', 'BBZ Rendsburg-Eckernförde')}
            />
          )}
        </Flex>

        {/* Center section */}
        <Flex flex="1" justify="center" align="center">
          <NavigationBar
            buttons={filteredNavigationButtons}
            onButtonClick={handleNavigationClick}
            onNewWindow={handleOpenInNewWindow}
          />
        </Flex>

        {/* Right section */}
        <Flex minW="fit-content" justify="flex-end" align="center" gap={2}>
          <CustomAppsMenu
            apps={settings.customApps}
            standardApps={settings.standardApps}
            onAppClick={handleCustomAppClick}
            onNewWindow={handleOpenInNewWindow}
          />

          {activeWebView && (
            <Flex gap={1}>
              <ButtonGroup size="sm" isAttached variant="outline">
                <Tooltip label="Zurück" placement="top">
                  <IconButton
                    icon={<span>←</span>}
                    onClick={() => handleWebViewNavigation('goBack')}
                    aria-label="Zurück"
                    height="28px"
                  />
                </Tooltip>
                <Tooltip label="Vorwärts" placement="top">
                  <IconButton
                    icon={<span>→</span>}
                    onClick={() => handleWebViewNavigation('goForward')}
                    aria-label="Vorwärts"
                    height="28px"
                  />
                </Tooltip>
                <Tooltip label="Neu laden" placement="top">
                  <IconButton
                    icon={<span>↻</span>}
                    onClick={() => handleWebViewNavigation('reload')}
                    aria-label="Neu laden"
                    height="28px"
                  />
                </Tooltip>
              </ButtonGroup>

              <Tooltip label="Link kopieren" placement="top">
                <IconButton
                  icon={<span>📋</span>}
                  onClick={handleCopyUrl}
                  aria-label="Link kopieren"
                  height="28px"
                  variant="outline"
                />
              </Tooltip>
            </Flex>
          )}

          <Tooltip label="Einstellungen" placement="top">
            <IconButton
              aria-label="Einstellungen öffnen"
              icon={<span>⚙️</span>}
              onClick={onOpen}
              variant="ghost"
              size="sm"
              height="28px"
            />
          </Tooltip>
        </Flex>
      </Flex>

      <Box flex="1" position="relative" overflow="hidden">
        {!isLoadingEmail && (
          <WebViewContainer
            ref={webViewRef}
            activeWebView={activeWebView}
            standardApps={filteredNavigationButtons}
            onNavigate={(url) => {
              setCurrentUrl(url);
              if (activeWebView) {
                setActiveWebView({
                  ...activeWebView,
                  url,
                });
              }
            }}
          />
        )}
      </Box>

      <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="md">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton aria-label="Einstellungen schließen" />
          <DrawerHeader>Einstellungen</DrawerHeader>
          <DrawerBody>
            <SettingsPanel onClose={onClose} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Modal isOpen={showEmailModal} onClose={() => {}} closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Willkommen bei BBZCloud</ModalHeader>
          <ModalBody>
            <FormControl isRequired>
              <FormLabel>Bitte geben Sie Ihre E-Mail-Adresse ein</FormLabel>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="beispiel@bbz-rd-eck.de"
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" onClick={handleEmailSubmit} isDisabled={!email}>
              Bestätigen
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

export default App;
