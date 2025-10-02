/**
 * ShortcutsModal Component
 * 
 * Displays a comprehensive overview of all available keyboard shortcuts
 * organized by category for easy reference by users.
 */

import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  VStack,
  HStack,
  Text,
  Box,
  Heading,
  Kbd,
  useColorModeValue,
  Divider,
} from '@chakra-ui/react';

/**
 * ShortcutItem Component
 * Displays a single keyboard shortcut with its description
 */
const ShortcutItem = ({ keys, description }) => {
  const keyBg = useColorModeValue('gray.100', 'gray.700');
  
  return (
    <HStack justify="space-between" w="100%" py={2}>
      <Text flex="1">{description}</Text>
      <HStack spacing={1}>
        {keys.map((key, index) => (
          <React.Fragment key={index}>
            {index > 0 && <Text fontSize="sm" color="gray.500">+</Text>}
            <Kbd bg={keyBg} px={2} py={1}>{key}</Kbd>
          </React.Fragment>
        ))}
      </HStack>
    </HStack>
  );
};

/**
 * ShortcutsModal Component
 * Main modal that displays all keyboard shortcuts grouped by category
 */
const ShortcutsModal = ({ isOpen, onClose }) => {
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const sectionBg = useColorModeValue('gray.50', 'gray.800');

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent maxH="85vh">
        <ModalHeader>Tastaturkürzel</ModalHeader>
        <ModalCloseButton />
        <ModalBody 
          pb={6} 
          overflowY="auto" 
          maxH="calc(85vh - 120px)"
          css={{
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'var(--chakra-colors-gray-100)',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'var(--chakra-colors-gray-400)',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: 'var(--chakra-colors-gray-500)',
            },
          }}
        >
          <VStack spacing={6} align="stretch">
            {/* Navigation Shortcuts Section */}
            <Box>
              <Heading size="sm" mb={3} color="blue.500">
                Navigation
              </Heading>
              <VStack 
                spacing={0} 
                align="stretch" 
                bg={sectionBg} 
                borderRadius="md" 
                p={3}
                divider={<Divider borderColor={borderColor} />}
              >
                <ShortcutItem 
                  keys={['Ctrl', 'Shift', 'T']} 
                  description="Todo-Liste öffnen/schließen" 
                />
                <ShortcutItem 
                  keys={['Ctrl', 'Shift', 'D']} 
                  description="Sichere Dokumente öffnen/schließen" 
                />
                <ShortcutItem 
                  keys={['Ctrl', 'Shift', 'O']} 
                  description="Einstellungen öffnen" 
                />
                <ShortcutItem 
                  keys={['Ctrl', '1-9']} 
                  description="Direkt zu App 1-9 wechseln" 
                />
                <ShortcutItem 
                  keys={['Alt', '←']} 
                  description="WebView zurück" 
                />
                <ShortcutItem 
                  keys={['Alt', '→']} 
                  description="WebView vorwärts" 
                />
                <ShortcutItem 
                  keys={['F5']} 
                  description="WebView neu laden" 
                />
              </VStack>
            </Box>

            {/* System Shortcuts Section */}
            <Box>
              <Heading size="sm" mb={3} color="green.500">
                System
              </Heading>
              <VStack 
                spacing={0} 
                align="stretch" 
                bg={sectionBg} 
                borderRadius="md" 
                p={3}
                divider={<Divider borderColor={borderColor} />}
              >
                <ShortcutItem 
                  keys={['Ctrl', 'R']} 
                  description="Aktuelle Ansicht neu laden" 
                />
                <ShortcutItem 
                  keys={['Ctrl', 'Shift', 'R']} 
                  description="Alle WebViews neu laden" 
                />
                <ShortcutItem 
                  keys={['Ctrl', 'Shift', 'P']} 
                  description="Drucken" 
                />
                <ShortcutItem 
                  keys={['F11']} 
                  description="Vollbildmodus umschalten" 
                />
                <ShortcutItem 
                  keys={['Esc']} 
                  description="Modal/Drawer schließen" 
                />
              </VStack>
            </Box>

            {/* Power User Shortcuts Section */}
            <Box>
              <Heading size="sm" mb={3} color="purple.500">
                Erweitert
              </Heading>
              <VStack 
                spacing={0} 
                align="stretch" 
                bg={sectionBg} 
                borderRadius="md" 
                p={3}
                divider={<Divider borderColor={borderColor} />}
              >
                <ShortcutItem 
                  keys={['Ctrl', 'P']} 
                  description="Befehlspalette öffnen" 
                />
                <ShortcutItem 
                  keys={['Ctrl', 'F']} 
                  description="Suchen in WebView" 
                />
              </VStack>
            </Box>

            {/* Platform Notes */}
            <Box 
              p={3} 
              bg={useColorModeValue('blue.50', 'blue.900')} 
              borderRadius="md"
              borderLeft="4px"
              borderColor="blue.500"
            >
              <Text fontSize="sm" fontWeight="medium" mb={1}>
                Hinweis
              </Text>
              <Text fontSize="sm" color={useColorModeValue('gray.700', 'gray.300')}>
                Auf macOS verwenden Sie <Kbd>Cmd</Kbd> anstelle von <Kbd>Ctrl</Kbd> für alle Tastenkombinationen.
              </Text>
            </Box>

            {/* Tip about Command Palette */}
            <Box 
              p={3} 
              bg={useColorModeValue('purple.50', 'purple.900')} 
              borderRadius="md"
              borderLeft="4px"
              borderColor="purple.500"
            >
              <Text fontSize="sm" fontWeight="medium" mb={1}>
                💡 Tipp
              </Text>
              <Text fontSize="sm" color={useColorModeValue('gray.700', 'gray.300')}>
                Drücken Sie <Kbd>Ctrl</Kbd>+<Kbd>P</Kbd>, um die Befehlspalette zu öffnen. 
                Dort können Sie nach allen Funktionen suchen und diese per Tastatur ausführen.
              </Text>
            </Box>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ShortcutsModal;
