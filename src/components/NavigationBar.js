import React from 'react';
import {
  Flex,
  Button,
  IconButton,
  Tooltip,
  ButtonGroup,
  useColorMode,
} from '@chakra-ui/react';

function NavigationBar({ buttons, onButtonClick, onNewWindow }) {
  const { colorMode } = useColorMode();

  return (
    <Flex as="nav" gap={1} align="center" minWidth="0" flex="0 1 auto">
      {Object.entries(buttons)
        .filter(([_, config]) => config.visible)
        .map(([id, config]) => (
          <ButtonGroup key={id} size="sm" isAttached variant="outline" spacing={0}>
            <Button
              onClick={() => onButtonClick(id)}
              variant={config.buttonVariant || 'solid'}
              _hover={{
                opacity: 0.8,
              }}
              height="28px"
              minW="auto"
              px={2}
              fontSize="xs"
            >
              {config.title}
            </Button>
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
