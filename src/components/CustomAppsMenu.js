import React from 'react';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Button,
  Text,
  HStack,
  useColorMode,
  IconButton,
  Image,
} from '@chakra-ui/react';

function CustomAppsMenu({ apps, standardApps, onAppClick, onNewWindow }) {
  const { colorMode } = useColorMode();

  const hasStandardApps = standardApps && standardApps.length > 0;
  const hasCustomApps = apps && apps.length > 0;
  const hasAnyApps = hasStandardApps || hasCustomApps;

  if (!hasAnyApps) {
    return (
      <Button
        variant="ghost"
        size="sm"
        opacity={0.6}
        cursor="default"
        _hover={{ bg: 'transparent' }}
        height="28px"
      >
        Apps
      </Button>
    );
  }

  return (
    <Menu>
      <MenuButton
        as={Button}
        rightIcon={<span>▼</span>}
        variant="outline"
        size="sm"
        height="28px"
        minW="auto"
        px={3}
        fontSize="xs"
      >
        Apps
      </MenuButton>
      <MenuList
        bg={colorMode === 'light' ? 'white' : 'gray.800'}
        borderColor={colorMode === 'light' ? 'gray.200' : 'gray.600'}
        boxShadow="md"
        zIndex={4000}
      >
        {/* Standard Apps */}
        {hasStandardApps && standardApps.map((app) => (
          <MenuItem
            key={app.id}
            onClick={() => onAppClick(app)}
            _hover={{
              bg: colorMode === 'light' ? 'gray.100' : 'gray.700',
            }}
          >
            <HStack justify="space-between" width="100%" spacing={2}>
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
              <IconButton
                size="xs"
                variant="ghost"
                icon={<span>↗️</span>}
                aria-label={`${app.title} in neuem Fenster öffnen`}
                onClick={(e) => {
                  e.stopPropagation();
                  onNewWindow(app.url, app.title);
                }}
                _hover={{
                  bg: colorMode === 'light' ? 'gray.200' : 'gray.600',
                }}
                height="20px"
                minW="20px"
                p={0}
              />
            </HStack>
          </MenuItem>
        ))}

        {/* Divider between standard and custom apps */}
        {hasStandardApps && hasCustomApps && <MenuDivider />}

        {/* Custom Apps */}
        {hasCustomApps && apps.map((app) => (
          <MenuItem
            key={app.id}
            onClick={() => onAppClick(app)}
            _hover={{
              bg: colorMode === 'light' ? 'gray.100' : 'gray.700',
            }}
          >
            <HStack justify="space-between" width="100%" spacing={2}>
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
              <IconButton
                size="xs"
                variant="ghost"
                icon={<span>↗️</span>}
                aria-label={`${app.title} in neuem Fenster öffnen`}
                onClick={(e) => {
                  e.stopPropagation();
                  onNewWindow(app.url, app.title);
                }}
                _hover={{
                  bg: colorMode === 'light' ? 'gray.200' : 'gray.600',
                }}
                height="20px"
                minW="20px"
                p={0}
              />
            </HStack>
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
}

export default CustomAppsMenu;
