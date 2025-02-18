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
  Text,
} from '@chakra-ui/react';
import { useSettings } from './context/SettingsContext';
import NavigationBar from './components/NavigationBar';
import WebViewContainer from './components/WebViewContainer';
import SettingsPanel from './components/SettingsPanel';
import CustomAppsMenu from './components/CustomAppsMenu';
import TodoList from './components/TodoList';
import DocumentsMenu from './components/DocumentsMenu';
import SecureDocuments from './components/SecureDocuments';

// Helper function for delays
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function App() {
  const { setColorMode } = useColorMode();
  const { settings } = useSettings();
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [welcomeStep, setWelcomeStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bbbPassword, setBbbPassword] = useState('');
  const [webuntisEmail, setWebuntisEmail] = useState('');
  const [webuntisPassword, setWebuntisPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showBBBPassword, setShowBBBPassword] = useState(false);
  const [showWebuntisPassword, setShowWebuntisPassword] = useState(false);
  const [isLoadingEmail, setIsLoadingEmail] = useState(true);
  const [dbPath, setDbPath] = useState('');

  useEffect(() => {
    setColorMode(settings.theme);
  }, [settings.theme, setColorMode]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load credentials
        await sleep(1000); // wait a second to make loading of credentials more reliable
        const [emailResult, passwordResult, bbbPasswordResult, webuntisEmailResult, webuntisPasswordResult] = await Promise.all([
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
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'webuntisEmail'
          }),
          window.electron.getCredentials({
            service: 'bbzcloud',
            account: 'webuntisPassword'
          })
        ]);

        // Load database path
        const path = await window.electron.getDatabasePath();
        setDbPath(path);

        // Only set email if found, but don't show welcome modal on error
        if (emailResult.success && emailResult.password) {
          setEmail(emailResult.password);
        }

        if (passwordResult.success && passwordResult.password) {
          setPassword(passwordResult.password);
        }

        if (bbbPasswordResult.success && bbbPasswordResult.password) {
          setBbbPassword(bbbPasswordResult.password);
        }

        if (webuntisEmailResult.success && webuntisEmailResult.password) {
          setWebuntisEmail(webuntisEmailResult.password);
        }

        if (webuntisPasswordResult.success && webuntisPasswordResult.password) {
          setWebuntisPassword(webuntisPasswordResult.password);
        }

        // Only show welcome modal if no email is saved
        if (!emailResult.success || !emailResult.password) {
          setShowWelcomeModal(true);
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
      } finally {
        setIsLoadingEmail(false);
      }
    };
    loadInitialData();
  }, []);

  const handleCredentialsSubmit = async () => {
    if (!email) return;

    if (welcomeStep === 1) {
      setWelcomeStep(2);
      return;
    }
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
        }) : Promise.resolve(),
        webuntisEmail ? window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'webuntisEmail',
          password: webuntisEmail
        }) : Promise.resolve(),
        webuntisPassword ? window.electron.saveCredentials({
          service: 'bbzcloud',
          account: 'webuntisPassword',
          password: webuntisPassword
        }) : Promise.resolve()
      ]);
      
      // Trigger a database change event to reload settings
      window.electron.emit('database-changed');
      
      // Close modal and reload the app after a delay to ensure credentials are saved
      setShowWelcomeModal(false);
      await sleep(2000); // Wait 2 seconds before reload to ensure credentials are saved
      window.location.reload();
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
      setContextMenuText(text);
      onTodoOpen(); // Open todo drawer when text is selected
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
  const [hasUpdate, setHasUpdate] = useState(false);
  const [reminderCount, setReminderCount] = useState(0);
  const toast = useToast();

  // Listen for update status
  useEffect(() => {
    const unsubscribe = window.electron.onUpdateStatus((status) => {
      const isUpdateAvailable = status.includes('verfügbar') || status.includes('heruntergeladen');
      setHasUpdate(isUpdateAvailable);
    });

    return () => unsubscribe();
  }, []);

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

  // Listen for database changes
  useEffect(() => {
    const unsubscribe = window.electron.on('database-changed', () => {
      // Reload all webviews when database changes
      if (webViewRef.current) {
        webViewRef.current.reload();
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!activeWebView && settings.navigationButtons) {
      const filteredButtons = filterNavigationButtons();
      const isTeacher = email.endsWith('@bbz-rd-eck.de');
      
      // For teachers, use the startup app setting if available
      if (isTeacher && settings.startupApp) {
        const startupConfig = filteredButtons[settings.startupApp];
        if (startupConfig && startupConfig.visible) {
          setActiveWebView({
            id: settings.startupApp,
            url: startupConfig.url,
            title: startupConfig.title,
          });
          setCurrentUrl(startupConfig.url);
          return;
        }
      }
      
      // For non-teachers or if teacher's startup app is not available,
      // try to use schul.cloud
      const schulcloudConfig = filteredButtons['schulcloud'];
      if (schulcloudConfig && schulcloudConfig.visible) {
        setActiveWebView({
          id: 'schulcloud',
          url: schulcloudConfig.url,
          title: schulcloudConfig.title,
        });
        setCurrentUrl(schulcloudConfig.url);
      } else {
        // Fallback to first visible app if schul.cloud is not available
        const firstVisibleApp = Object.entries(filteredButtons)
          .find(([_, config]) => config.visible);
        
        if (firstVisibleApp) {
          const [id, config] = firstVisibleApp;
          const webviewId = id.toLowerCase();
          setActiveWebView({
            id: webviewId,
            url: config.url,
            title: config.title,
          });
          setCurrentUrl(config.url);
        }
      }
    }
  }, [settings.navigationButtons, settings.startupApp, activeWebView, filterNavigationButtons, email]);

  const handleNavigationClick = (buttonId, isCtrlPressed) => {
    const filteredButtons = filterNavigationButtons();
    // Convert buttonId to lowercase for lookup since keys in filteredButtons are lowercase
    const buttonConfig = filteredButtons[buttonId.toLowerCase()];
    if (buttonConfig) {
      if (isCtrlPressed) {
        window.electron.shell.openExternal(buttonConfig.url);
      } else {
        // Ensure we're setting the correct ID that matches the webview ID
        const webviewId = buttonId.toLowerCase(); // WebView IDs are lowercase
        setActiveWebView({
          id: webviewId,
          url: buttonConfig.url,
          title: buttonConfig.title,
        });
        setCurrentUrl(buttonConfig.url);
      }
    }
  };

  const handleCustomAppClick = (app) => {
    // Ensure consistent case with webview IDs
    const webviewId = app.id.toLowerCase();
    setActiveWebView({
      id: webviewId,
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
        {/* Left section - Dynamic width */}
        <Box minW="40px" w="auto" pl={1}>
          {appIconPath && (
            <Image
              src={`file://${appIconPath}`}
              alt="BBZCloud Logo"
              height="28px"
              width="28px"
              objectFit="contain"
              cursor="pointer"
              onClick={() => handleOpenInNewWindow('https://www.bbz-rd-eck.de', 'BBZ Rendsburg-Eckernförde')}
            />
          )}
        </Box>

        {/* Center section - Center navigation with equal spacing */}
        <Box flex="1" display="flex" justifyContent="center" alignItems="center" minW={0}>
          <Box>
            <NavigationBar
              buttons={filteredNavigationButtons}
              onButtonClick={handleNavigationClick}
              onNewWindow={handleOpenInNewWindow}
            />
          </Box>
        </Box>

        {/* Right section - Responsive width */}
        <Box minW="auto" pr={2} overflow="hidden">
          <Flex justify="flex-end" align="center" gap={1} flexShrink={1} minW={0} flexWrap="nowrap">
            <CustomAppsMenu
              apps={settings.customApps}
              standardApps={settings.standardApps}
              onAppClick={handleCustomAppClick}
              onNewWindow={handleOpenInNewWindow}
            />

            {activeWebView && (
              <Flex gap={1} flexShrink={1} minW={0}>
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

            <DocumentsMenu 
              reminderCount={reminderCount}
              onNavigate={(view) => {
                if (view === 'todo') {
                  onTodoOpen();
                } else if (view === 'secure-documents') {
                  onSecureDocsOpen();
                }
              }} 
            />

            <ButtonGroup size="sm" position="relative">
              <Tooltip label="Einstellungen" placement="top">
                <IconButton
                  aria-label="Einstellungen öffnen"
                  icon={<span>⚙️</span>}
                  onClick={onSettingsOpen}
                  variant="ghost"
                  height="28px"
                />
              </Tooltip>
              <Box
                position="absolute"
                top="-2px"
                right="-2px"
                width="10px"
                height="10px"
                borderRadius="full"
                bg="red.500"
                border="2px solid"
                borderColor={useColorModeValue('white', 'gray.800')}
                display={hasUpdate ? 'block' : 'none'}
              />
            </ButtonGroup>
          </Flex>
        </Box>
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
            <TodoList 
              initialText={contextMenuText} 
              onTextAdded={() => setContextMenuText('')}
              isVisible={isTodoOpen}
              onReminderCountChange={setReminderCount}
            />
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
            <SecureDocuments isVisible={isSecureDocsOpen} />
          </Box>
        </Flex>
      </Box>

      <Modal isOpen={showWelcomeModal} onClose={() => {}} closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Willkommen bei BBZCloud</ModalHeader>
          <ModalBody>
            <VStack spacing={4}>
              {welcomeStep === 1 && (
                <>
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

                  <FormControl>
                    <FormLabel>WebUntis Login</FormLabel>
                    <Input
                      type="text"
                      value={webuntisEmail}
                      onChange={(e) => setWebuntisEmail(e.target.value)}
                      placeholder="WebUntis Benutzername (optional)"
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>WebUntis Passwort</FormLabel>
                    <InputGroup>
                      <Input
                        type={showWebuntisPassword ? 'text' : 'password'}
                        value={webuntisPassword}
                        onChange={(e) => setWebuntisPassword(e.target.value)}
                        placeholder="WebUntis Passwort (optional)"
                      />
                      <InputRightElement width="4.5rem">
                        <Button h="1.75rem" size="sm" onClick={() => setShowWebuntisPassword(!showWebuntisPassword)}>
                          {showWebuntisPassword ? 'Verbergen' : 'Zeigen'}
                        </Button>
                      </InputRightElement>
                    </InputGroup>
                  </FormControl>
                </>
              )}

              {welcomeStep === 2 && (
                <>
                  <Text>
                    Wählen Sie einen Speicherort für die Datenbank aus. Hier werden Ihre Einstellungen, 
                    ToDos und benutzerdefinierten Apps gespeichert.
                  </Text>
                  <FormControl>
                    <FormLabel>Datenbank-Speicherort</FormLabel>
                    <Input value={dbPath} isReadOnly placeholder="Standardspeicherort" />
                  </FormControl>
                  <Button onClick={async () => {
                    try {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.db';
                      input.style.display = 'none';
                      document.body.appendChild(input);

                      input.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const result = await window.electron.changeDatabaseLocation(file.path);
                          if (result.success) {
                            setDbPath(file.path);
                            toast({
                              title: 'Datenbank-Speicherort festgelegt',
                              status: 'success',
                              duration: 3000,
                            });
                          } else {
                            throw new Error(result.error);
                          }
                        }
                        document.body.removeChild(input);
                      };

                      input.click();
                    } catch (error) {
                      toast({
                        title: 'Fehler beim Festlegen des Speicherorts',
                        description: error.message,
                        status: 'error',
                        duration: 5000,
                      });
                    }
                  }}>
                    Speicherort auswählen
                  </Button>
                </>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            {welcomeStep === 1 ? (
              <Button colorScheme="blue" onClick={handleCredentialsSubmit} isDisabled={!email}>
                Weiter
              </Button>
            ) : (
              <Button colorScheme="blue" onClick={handleCredentialsSubmit}>
                Fertig
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

export default App;
