/**
 * OverlaySurface
 *
 * Root component rendered inside the dedicated overlay BrowserWindow.
 * Receives surface payloads via IPC (`overlay:open`) and dispatches user
 * actions back to the main window (`overlay:action`).
 *
 * Surfaces:
 *   - commandPalette  — centred modal with dimmed backdrop
 *   - documentsMenu   — positioned dropdown near its trigger button
 *   - customAppsMenu  — positioned dropdown near its trigger button
 */

import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { Box, Flex, Text, HStack, Badge, Image, useColorMode } from '@chakra-ui/react';
import CommandPaletteUI from './CommandPaletteUI';

// ─── Shared dropdown primitives ────────────────────────────────────────────────

function DropdownItem({ onClick, colorMode, children }) {
  return (
    <Box
      px={3}
      py="6px"
      cursor="pointer"
      fontSize="xs"
      _hover={{ bg: colorMode === 'light' ? 'gray.100' : 'gray.700' }}
      onClick={onClick}
    >
      {children}
    </Box>
  );
}

function DropdownDivider({ colorMode }) {
  return (
    <Box
      borderTopWidth="1px"
      borderColor={colorMode === 'light' ? 'gray.200' : 'gray.600'}
      my={1}
    />
  );
}

/**
 * Transparent click-catch backdrop + the menu card positioned below its trigger.
 * Clicking outside the card calls `onClose`.
 */
function DropdownWrapper({ triggerRect, onClose, colorMode, children }) {
  return (
    <Box position="absolute" inset={0} onClick={onClose}>
      <Box
        position="absolute"
        left={`${triggerRect.x}px`}
        top={`${triggerRect.y + triggerRect.height + 4}px`}
        bg={colorMode === 'light' ? 'white' : 'gray.800'}
        borderColor={colorMode === 'light' ? 'gray.200' : 'gray.600'}
        borderWidth="1px"
        borderRadius="md"
        boxShadow="md"
        py={1}
        minW="180px"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </Box>
    </Box>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

const OverlaySurface = () => {
  const [activeSurface, setActiveSurface] = useState(null);
  const [payload, setPayload] = useState(null);
  const { colorMode, setColorMode } = useColorMode();

  useLayoutEffect(() => {
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
  }, []);

  useEffect(() => {
    if (!window.electron?.onThemeChanged) return;
    const unsub = window.electron.onThemeChanged((nextTheme) => {
      if (nextTheme === 'light' || nextTheme === 'dark') setColorMode(nextTheme);
    });
    return unsub;
  }, [setColorMode]);

  useEffect(() => {
    if (!window.electron?.overlay) return;

    const unsubOpen = window.electron.overlay.onOpen((data) => {
      setActiveSurface(data?.surface || null);
      setPayload(data || null);
    });

    const unsubHide = window.electron.overlay.onHide(() => {
      setActiveSurface(null);
      setPayload(null);
    });

    return () => { unsubOpen(); unsubHide(); };
  }, []);

  const hide = useCallback(() => {
    window.electron?.overlay?.hide();
  }, []);

  const sendAction = useCallback((action) => {
    window.electron?.overlay?.sendAction(action);
    window.electron?.overlay?.hide();
  }, []);

  // CommandPalette handlers
  const handleSelect = (commandId) => sendAction({ type: 'command', id: commandId });
  const handleClose = () => sendAction({ type: 'close' });

  const isModal = activeSurface === 'commandPalette';

  return (
    <Flex
      h="100vh"
      w="100vw"
      align="flex-start"
      justify="center"
      bg={isModal ? 'blackAlpha.500' : 'transparent'}
      sx={{ backdropFilter: isModal ? 'blur(2px)' : 'none' }}
      pt={isModal ? '10vh' : 0}
      px={isModal ? 4 : 0}
      position="relative"
    >
      {/* CommandPalette */}
      {activeSurface === 'commandPalette' && (
        <Box w="100%" maxW="640px">
          <CommandPaletteUI
            commands={payload?.commands || []}
            onSelect={handleSelect}
            onClose={handleClose}
          />
        </Box>
      )}

      {/* Documents menu (📝) */}
      {activeSurface === 'documentsMenu' && payload?.triggerRect && (
        <DropdownWrapper triggerRect={payload.triggerRect} onClose={hide} colorMode={colorMode}>
          <DropdownItem
            colorMode={colorMode}
            onClick={() => sendAction({ type: 'menu-navigate', id: 'todo' })}
          >
            <HStack spacing={2}>
              <span>✓</span>
              <Text fontSize="xs">ToDo-Listen</Text>
            </HStack>
          </DropdownItem>
          <DropdownItem
            colorMode={colorMode}
            onClick={() => sendAction({ type: 'menu-navigate', id: 'secure-documents' })}
          >
            <HStack spacing={2}>
              <span>🔒</span>
              <Text fontSize="xs">Sichere Dokumente</Text>
            </HStack>
          </DropdownItem>
        </DropdownWrapper>
      )}

      {/* Custom apps menu */}
      {activeSurface === 'customAppsMenu' && payload?.triggerRect && (
        <DropdownWrapper triggerRect={payload.triggerRect} onClose={hide} colorMode={colorMode}>
          {/* Standard apps */}
          {payload.standardApps?.map((app) => (
            <DropdownItem
              key={app.id}
              colorMode={colorMode}
              onClick={() => sendAction({ type: 'app-select', app })}
            >
              <HStack justify="space-between" width="100%">
                <HStack spacing={2}>
                  {app.favicon && (
                    <Image
                      src={app.favicon}
                      alt={`${app.title} icon`}
                      width="16px"
                      height="16px"
                      objectFit="contain"
                    />
                  )}
                  <Text fontSize="xs">{app.title}</Text>
                </HStack>
                <Box
                  as="span"
                  px={1}
                  py="2px"
                  borderRadius="sm"
                  _hover={{ bg: colorMode === 'light' ? 'gray.200' : 'gray.600' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    sendAction({ type: 'app-new-window', url: app.url, title: app.title });
                  }}
                >
                  ↗️
                </Box>
              </HStack>
            </DropdownItem>
          ))}

          {payload.standardApps?.length > 0 && payload.apps?.length > 0 && (
            <DropdownDivider colorMode={colorMode} />
          )}

          {/* Custom apps */}
          {payload.apps?.map((app) => (
            <DropdownItem
              key={app.id}
              colorMode={colorMode}
              onClick={() => sendAction({ type: 'app-select', app })}
            >
              <HStack justify="space-between" width="100%">
                <HStack spacing={2}>
                  {app.favicon && (
                    <Image
                      src={app.favicon}
                      alt={`${app.title} icon`}
                      width="16px"
                      height="16px"
                      objectFit="contain"
                    />
                  )}
                  <Text fontSize="xs">{app.title}</Text>
                </HStack>
                <Box
                  as="span"
                  px={1}
                  py="2px"
                  borderRadius="sm"
                  _hover={{ bg: colorMode === 'light' ? 'gray.200' : 'gray.600' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    sendAction({ type: 'app-new-window', url: app.url, title: app.title });
                  }}
                >
                  ↗️
                </Box>
              </HStack>
            </DropdownItem>
          ))}

          {!payload.standardApps?.length && !payload.apps?.length && (
            <Box px={3} py={2}>
              <Text fontSize="xs" color="gray.500">Keine Apps verfügbar</Text>
            </Box>
          )}
        </DropdownWrapper>
      )}
    </Flex>
  );
};

export default OverlaySurface;
