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
  // Adjust width threshold for text in buttons based on zoom - as zoom increases, we can allow less width since elements are larger
  const baseThreshold = 1480;
  // Adjust threshold based on zoom level
  const zoomThresholds = {
    0.7: baseThreshold - 200,
    0.75: baseThreshold - 160,
    0.8: baseThreshold - 120,
    0.85: baseThreshold - 70,
    0.9: baseThreshold - 45,
    0.95: baseThreshold + 15,
    1.0: baseThreshold + 85,
    1.05: baseThreshold + 130,
    1.1: baseThreshold + 185,
    1.15: baseThreshold + 230,
    1.2: baseThreshold + 270,
  };

  const zoomThreshold = zoomThresholds[settings.navbarZoom] || baseThreshold;

  const showText = windowWidth >= zoomThreshold;

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
      gap={2}
      align="center" 
      minWidth="fit-content"
      width="fit-content"
      flex="0 0 auto"
      position="relative"
      flexWrap="nowrap"
      flexShrink={0}
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
                  onClick={(e) => onButtonClick(id, e.ctrlKey)}
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
