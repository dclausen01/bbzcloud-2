import React, { useState, useEffect } from 'react';
import {
  Flex,
  Button,
  IconButton,
  Tooltip,
  ButtonGroup,
  useColorMode,
} from '@chakra-ui/react';
import { useSettings } from '../context/SettingsContext';

function NavigationBar({ buttons, onButtonClick, onNewWindow }) {
  const { colorMode } = useColorMode();
  const { settings } = useSettings();
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  // Adjust width threshold based on zoom - as zoom increases, we need less width since elements are larger
  let baseThreshold = 1430;
  // Adjust threshold based on zoom level - adjusting baseThreshold by 10% for each zoom level before calculating zoomAdjustedThreshold
  if (settings.navbarZoom < 1) {
    baseThreshold += baseThreshold * (settings.navbarZoom / 7.5);
  } else if (settings.navbarZoom > 1) {
    baseThreshold += baseThreshold * (settings.navbarZoom / 8.5);
  }
  const zoomAdjustedThreshold = baseThreshold * (settings.navbarZoom + (1 / settings.navbarZoom) / 11);
  const showText = windowWidth >= zoomAdjustedThreshold;

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getSymbol = (id) => {
    const symbols = {
      schulcloud: '💬',
      moodle: '📚',
      bbb: '🎥',
      outlook: '📧',
      office: '💼',
      cryptpad: '📝',
      taskcards: '🗺️',
      webuntis: '📅',
      wiki: '📖',
      handbook: '📔',
    };
    return symbols[id] || '🔗';
  };

  return (
    <Flex 
      as="nav" 
      gap={1} 
      align="center" 
      minWidth="0"
      maxWidth="100%"
      flex="0 1 auto"
      overflow="visible"
      position="relative"
      style={{
        transform: `scale(${settings.navbarZoom})`,
        transformOrigin: 'center center'
      }}
    >
      {Object.entries(buttons)
        .filter(([_, config]) => config.visible)
        .map(([id, config]) => (
          <ButtonGroup key={id} size="sm" isAttached variant="outline" spacing={0}>
            <Tooltip label={!showText ? config.title : undefined} placement="top">
              <Button
                onClick={() => onButtonClick(id)}
                variant={config.buttonVariant || 'solid'}
                _hover={{
                  opacity: 0.8,
                }}
                height="28px"
                minW={showText ? "auto" : "28px"}
                px={showText ? 2 : 1}
                fontSize="xs"
                display="flex"
                alignItems="center"
                justifyContent="center"
                gap={2}
              >
                {!showText && <span>{getSymbol(id)}</span>}
                {showText && config.title}
              </Button>
            </Tooltip>
            <Tooltip label="In neuem Fenster öffnen" placement="top">
              <IconButton
                aria-label={`${config.title} in neuem Fenster öffnen`}
                icon={<span>↗️</span>}
                onClick={() => onNewWindow(config.url, config.title)}
                borderLeft="1px"
                borderColor={colorMode === 'light' ? 'gray.200' : 'gray.600'}
                variant={config.buttonVariant || 'solid'}
                _hover={{
                  opacity: 0.8,
                }}
                height="28px"
                minW="28px"
                px={0}
                fontSize="xs"
              />
            </Tooltip>
          </ButtonGroup>
        ))}
    </Flex>
  );
}

export default NavigationBar;
