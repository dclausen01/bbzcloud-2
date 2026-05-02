import React from 'react';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button,
  Text,
  HStack,
  useColorMode,
  Badge,
} from '@chakra-ui/react';
import { wcvOverlayGuard } from '../utils/wcvOverlayGuard';

function DocumentsMenu({ onNavigate, reminderCount = 0 }) {
  const { colorMode } = useColorMode();

  return (
    <Menu onOpen={wcvOverlayGuard.enter} onClose={wcvOverlayGuard.exit}>
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
        <HStack spacing={1}>
          <span>📝</span>
          {reminderCount > 0 && (
            <Badge
              colorScheme="purple"
              variant="solid"
              borderRadius="full"
              fontSize="0.6em"
              minW="1.6em"
              textAlign="center"
            >
              {reminderCount}
            </Badge>
          )}
        </HStack>
      </MenuButton>
      <MenuList
        bg={colorMode === 'light' ? 'white' : 'gray.800'}
        borderColor={colorMode === 'light' ? 'gray.200' : 'gray.600'}
        boxShadow="md"
      >
        <MenuItem
          onClick={() => onNavigate('todo')}
          _hover={{
            bg: colorMode === 'light' ? 'gray.100' : 'gray.700',
          }}
        >
          <HStack spacing={2}>
            <span>✓</span>
            <Text fontSize="xs">ToDo-Listen</Text>
          </HStack>
        </MenuItem>
        <MenuItem
          onClick={() => onNavigate('secure-documents')}
          _hover={{
            bg: colorMode === 'light' ? 'gray.100' : 'gray.700',
          }}
        >
          <HStack spacing={2}>
            <span>🔒</span>
            <Text fontSize="xs">Sichere Dokumente</Text>
          </HStack>
        </MenuItem>
      </MenuList>
    </Menu>
  );
}

export default DocumentsMenu;
