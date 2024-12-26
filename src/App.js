import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CloseIcon } from '@chakra-ui/icons';
import {
  Box,
  Flex,
  IconButton,
  useColorMode,
  useColorModeValue,
  useDisclosure,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  ButtonGroup,
  Image,
  Tooltip,
  useToast,
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
  InputGroup,
  InputRightElement,
  VStack,
} from '@chakra-ui/react';
import { useSettings } from './context/SettingsContext';
import NavigationBar from './components/NavigationBar';
import WebViewContainer from './components/WebViewContainer';
import SettingsPanel from './components/SettingsPanel';
import CustomAppsMenu from './components/CustomAppsMenu';
import TodoList from './components/TodoList';
import DocumentsMenu from './components/DocumentsMenu';
import SecureDocuments from './components/SecureDocuments';

function App() {
  const { setColorMode } = useColorMode();
  const { settings } = useSettings();
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bbbPassword, setBbbPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showBBBPassword, setShowBBBPassword] = useState(false);
  const [isLoadingEmail, setIsLoadingEmail] = useState(true);

  useEffect(() => {
    setColorMode(settings.theme);
  }, [settings.theme, setColorMode]);

  useEffect(() => {
    const loadCredentials = async () => {
      try {
        const [emailResult, passwordResult, bbbPasswordResult] = await Promise.all([
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'email'
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'password'
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'bbbPassword'
          })
        ]);

        if (emailResult.success && emailResult.password) {
          setEmail(emailResult.password);
        } else {
          setShowEmailModal(true);
        }

        if (passwordResult.success && passwordResult.password) {
          setPassword(passwordResult.password);
        }

        if (bbbPasswordResult.success && bbbPasswordResult.password) {
          setBbbPassword(bbbPasswordResult.password);
        }
      } catch (error) {
        console.error('Error loading credentials:', error);
      } finally {
        setIsLoadingEmail(false);
      }
    };
    loadCredentials();
  }, []);

  const handleCredentialsSubmit = async () => {
    if (!email) return;
    
    try {
      await Promise.all([
        window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'email',
          password: email
        }),
        password ? window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'password',
          password: password
        }) : Promise.resolve(),
        bbbPassword ? window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'bbbPassword',
          password: bbbPassword
        }) : Promise.resolve()
      ]);
      
      setShowEmailModal(false);
    } catch (error) {
      console.error('Error saving credentials:', error);
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

    if (isTeacher) {
      return settings.navigationButtons;
    }

    const allowedApps = ['schulcloud', 'moodle', 'office', 'cryptpad', 'webuntis', 'wiki'];
    return Object.entries(settings.navigationButtons)
      .filter(([key]) => allowedApps.includes(key))
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
  }, [email, settings.navigationButtons]);

  const { 
    isOpen: isSettingsOpen, 
    onOpen: onSettingsOpen, 
    onClose: onSettingsClose 
  } = useDisclosure();
  
  const {
    isOpen: isTodoOpen,
    onOpen: onTodoOpen,
    onClose: onTodoClose
  } = useDisclosure();

  const {
    isOpen: isSecureDocsOpen,
    onOpen: onSecureDocsOpen,
    onClose: onSecureDocsClose
  } = useDisclosure();

  // Handle todo additions from context menu
  const [contextMenuText, setContextMenuText] = useState('');

  useEffect(() => {
    const unsubscribe = window.electron.onAddTodo((text) => {
      console.log('App - Received text from context menu:', text);
      setContextMenuText(text);
      onTodoOpen(); // Open todo drawer when text is selected
      window.electron.debug('App - Set context menu text and opened drawer');
    });
    return () => unsubscribe();
  }, [onTodoOpen]);

  // Clear context menu text when drawer closes
  useEffect(() => {
    if (!isTodoOpen) {
      setContextMenuText('');
    }
  }, [isTodoOpen]);
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

          <DocumentsMenu onNavigate={(view) => {
            if (view === 'todo') {
              onTodoOpen();
            } else if (view === 'secure-documents') {
              onSecureDocsOpen();
            }
          }} />
          <ButtonGroup size="sm">
            <Tooltip label="Einstellungen" placement="top">
              <IconButton
                aria-label="Einstellungen öffnen"
                icon={<span>⚙️</span>}
                onClick={onSettingsOpen}
                variant="ghost"
                height="28px"
              />
            </Tooltip>
          </ButtonGroup>
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

      <Drawer isOpen={isSettingsOpen} placement="right" onClose={onSettingsClose} size="md">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton aria-label="Einstellungen schließen" />
          <DrawerHeader>Einstellungen</DrawerHeader>
          <DrawerBody>
            <SettingsPanel onClose={onSettingsClose} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* Todo Drawer */}
      <Box 
        position="fixed" 
        right={0} 
        top="48px" 
        bottom={0} 
        width="450px" 
        bg={useColorModeValue('white', 'gray.800')}
        borderLeft="1px"
        borderColor={useColorModeValue('gray.200', 'gray.600')}
        display={isTodoOpen ? 'block' : 'none'}
        zIndex={1000}
      >
        <Flex direction="column" height="100%">
          <Flex justify="flex-end" p={2} borderBottom="1px" borderColor={useColorModeValue('gray.200', 'gray.600')}>
            <IconButton
              icon={<CloseIcon />}
              size="sm"
              onClick={onTodoClose}
              aria-label="Todo Liste schließen"
            />
          </Flex>
          <Box p={4} overflowY="auto" flex="1">
            <TodoList initialText={contextMenuText} onTextAdded={() => setContextMenuText('')} />
          </Box>
        </Flex>
      </Box>

      {/* Secure Documents Drawer */}
      <Box 
        position="fixed" 
        right={0} 
        top="48px" 
        bottom={0} 
        width="450px" 
        bg={useColorModeValue('white', 'gray.800')}
        borderLeft="1px"
        borderColor={useColorModeValue('gray.200', 'gray.600')}
        display={isSecureDocsOpen ? 'block' : 'none'}
        zIndex={1000}
      >
        <Flex direction="column" height="100%">
          <Flex justify="flex-end" p={2} borderBottom="1px" borderColor={useColorModeValue('gray.200', 'gray.600')}>
            <IconButton
              icon={<CloseIcon />}
              size="sm"
              onClick={onSecureDocsClose}
              aria-label="Sichere Dokumente schließen"
            />
          </Flex>
          <Box p={4} overflowY="auto" flex="1">
            <SecureDocuments />
          </Box>
        </Flex>
      </Box>

      <Modal isOpen={showEmailModal} onClose={() => {}} closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Willkommen bei BBZCloud</ModalHeader>
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>E-Mail-Adresse</FormLabel>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vorname.nachname@bbz-rd-eck.de oder @sus.bbz-rd-eck.de"
                />
              </FormControl>

              <FormControl>
                <FormLabel>Passwort</FormLabel>
                <InputGroup>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Passwort (optional)"
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
                    value={bbbPassword}
                    onChange={(e) => setBbbPassword(e.target.value)}
                    placeholder="BBB Passwort (optional)"
                  />
                  <InputRightElement width="4.5rem">
                    <Button h="1.75rem" size="sm" onClick={() => setShowBBBPassword(!showBBBPassword)}>
                      {showBBBPassword ? 'Verbergen' : 'Zeigen'}
                    </Button>
                  </InputRightElement>
                </InputGroup>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" onClick={handleCredentialsSubmit} isDisabled={!email}>
              Bestätigen
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

export default App;
