/**
 * OverlaySurface
 *
 * Root component rendered inside the dedicated overlay BrowserWindow.
 * Receives surface payloads via IPC (`overlay:open`) and dispatches user
 * actions back to the main window (`overlay:action`).
 *
 * Currently hosts the CommandPalette; can be extended for other overlay UI
 * (download toasts, notifications, etc.).
 */

import React, { useState, useEffect } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import CommandPaletteUI from './CommandPaletteUI';

const OverlaySurface = () => {
  const [activeSurface, setActiveSurface] = useState(null);
  const [payload, setPayload] = useState(null);

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

    return () => {
      unsubOpen();
      unsubHide();
    };
  }, []);

  const handleSelect = (commandId) => {
    if (window.electron?.overlay) {
      window.electron.overlay.sendAction({ type: 'command', id: commandId });
    }
  };

  const handleClose = () => {
    if (window.electron?.overlay) {
      window.electron.overlay.sendAction({ type: 'close' });
    }
  };

  return (
    <Flex
      h="100vh"
      w="100vw"
      align="flex-start"
      justify="center"
      // Dimmed backdrop — clicking outside the palette also fires window blur
      // which the main process turns into a hide.
      bg={activeSurface ? 'blackAlpha.500' : 'transparent'}
      sx={{ backdropFilter: activeSurface ? 'blur(2px)' : 'none' }}
      pt="10vh"
      px={4}
    >
      {activeSurface === 'commandPalette' && (
        <Box w="100%" maxW="640px">
          <CommandPaletteUI
            commands={payload?.commands || []}
            onSelect={handleSelect}
            onClose={handleClose}
          />
        </Box>
      )}
    </Flex>
  );
};

export default OverlaySurface;
