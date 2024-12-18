import React, { useState, useRef, useEffect } from 'react';
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
  Spacer,
  Tooltip,
  Text,
  useToast,
  ButtonGroup,
} from '@chakra-ui/react';
import { useSettings } from './context/SettingsContext';
import NavigationBar from './components/NavigationBar';
import WebViewContainer from './components/WebViewContainer';
import SettingsPanel from './components/SettingsPanel';
import CustomAppsMenu from './components/CustomAppsMenu';

function App() {
  const { colorMode } = useColorMode();
  const { settings } = useSettings();
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

  // Set first visible app as active on startup
  useEffect(() => {
    if (!activeWebView && settings.navigationButtons) {
      const firstVisibleApp = Object.entries(settings.navigationButtons)
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
  }, [settings.navigationButtons, activeWebView]);

  const handleNavigationClick = (buttonId) => {
    const buttonConfig = settings.navigationButtons[buttonId];
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

  return (
    <Box h="100vh" display="flex" flexDirection="column" overflow="hidden">
      <Flex
        as="header"
        align="center"
        p={2}
        borderBottom="1px"
        borderColor={colorMode === 'light' ? 'gray.200' : 'gray.700'}
        gap={2}
      >
        {appIconPath && (
          <Image
            src={`file://${appIconPath}`}
            alt="BBZCloud Logo"
            height="28px"
            width="28px"
            objectFit="contain"
            mr={2}
          />
        )}

        <NavigationBar
          buttons={settings.navigationButtons}
          onButtonClick={handleNavigationClick}
          onNewWindow={handleOpenInNewWindow}
        />

        <Spacer />
        
        <CustomAppsMenu
          apps={settings.customApps}
          standardApps={settings.standardApps}
          onAppClick={handleCustomAppClick}
          onNewWindow={handleOpenInNewWindow}
        />

        {activeWebView && (
          <Flex gap={1} ml={2}>
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
            ml={2}
          />
        </Tooltip>
      </Flex>

      <Box flex="1" position="relative" overflow="hidden">
        <WebViewContainer
          ref={webViewRef}
          activeWebView={activeWebView}
          standardApps={settings.navigationButtons}
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
    </Box>
  );
}

export default App;
