import React, { useState, useEffect } from 'react';
import AppIcon from './AppIcon';
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
  const baseThreshold = 1250;
  // Adjust threshold based on zoom level
  const zoomThresholds = {
    0.7: baseThreshold - 250,  // More reduction at very low zoom
    0.75: baseThreshold - 200,
    0.8: baseThreshold - 150,
    0.85: baseThreshold - 100,
    0.9: baseThreshold - 50,
    0.95: baseThreshold,       // No adjustment at 0.95
    1.0: baseThreshold + 50,   // More gradual increases
    1.05: baseThreshold + 100,
    1.1: baseThreshold + 150,
    1.15: baseThreshold + 200,
    1.2: baseThreshold + 250,
    1.25: baseThreshold + 300, // Add support for higher zoom levels
    1.3: baseThreshold + 350,
    1.35: baseThreshold + 400,
    1.4: baseThreshold + 450,
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
        transform: `scale(${settings.navbarZoom - 0.2})`,
        transformOrigin: 'center center'
      }}
    >
      {Object.entries(buttons)
        .filter(([_, config]) => config.visible)
        .map(([id, config]) => (
          <ButtonGroup key={id} size="sm" isAttached variant="outline" spacing={0}>
            <Tooltip label={!showText ? config.title : undefined} placement="top">
                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    onButtonClick(id, e.ctrlKey);
                  }}
                  variant={config.buttonVariant || 'solid'}
                _hover={{
                  opacity: 0.8,
                }}
                height="24px"
                minW={showText ? "auto" : "24px"}
                px={showText ? 2 : 1}
                fontSize="xs"
                display="flex"
                alignItems="center"
                justifyContent="center"
                gap={2}
              >
                {!showText && <AppIcon id={id} size="16px" />}
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
                height="24px"
                minW="24px"
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
