/**
 * ShortcutsModal Component
 * 
 * Displays a comprehensive overview of all available keyboard shortcuts
 * organized by category for easy reference by users.
 * 
 * Features:
 * - Keyboard navigation with arrow keys
 * - Auto-scroll to selected item
 * - Visual selection highlight
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
const ShortcutItem = ({ keys, description, isSelected, itemRef }) => {
  const keyBg = useColorModeValue('gray.100', 'gray.700');
  const selectedBg = useColorModeValue('blue.50', 'blue.900');
  const hoverBg = useColorModeValue('gray.50', 'gray.700');
  
  return (
    <HStack 
      ref={itemRef}
      justify="space-between" 
      w="100%" 
      py={2}
      px={2}
      borderRadius="md"
      bg={isSelected ? selectedBg : 'transparent'}
      _hover={{ bg: isSelected ? selectedBg : hoverBg }}
      transition="background-color 0.15s"
      cursor="default"
    >
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef(null);
  const selectedItemRef = useRef(null);
  
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const sectionBg = useColorModeValue('gray.50', 'gray.800');
  const footerBg = useColorModeValue('gray.50', 'gray.900');
  const mutedTextColor = useColorModeValue('gray.600', 'gray.400');

  // Define all shortcuts in a flat structure for navigation
  const allShortcuts = useMemo(() => [
    // Navigation
    { keys: ['Ctrl', 'Shift', 'T'], description: 'Todo-Liste öffnen/schließen', category: 'Navigation' },
    { keys: ['Ctrl', 'Shift', 'D'], description: 'Sichere Dokumente öffnen/schließen', category: 'Navigation' },
    { keys: ['Ctrl', 'Shift', 'O'], description: 'Einstellungen öffnen', category: 'Navigation' },
    { keys: ['Ctrl', '1-9'], description: 'Direkt zu App 1-9 wechseln', category: 'Navigation' },
    { keys: ['Alt', '←'], description: 'WebView zurück', category: 'Navigation' },
    { keys: ['Alt', '→'], description: 'WebView vorwärts', category: 'Navigation' },
    { keys: ['F5'], description: 'WebView neu laden', category: 'Navigation' },
    // System
    { keys: ['Ctrl', 'R'], description: 'Aktuelle Ansicht neu laden', category: 'System' },
    { keys: ['Ctrl', 'Shift', 'R'], description: 'Alle WebViews neu laden', category: 'System' },
    { keys: ['Ctrl', 'P'], description: 'Drucken', category: 'System' },
    { keys: ['F11'], description: 'Vollbildmodus umschalten', category: 'System' },
    { keys: ['Esc'], description: 'Modal/Drawer schließen', category: 'System' },
    // Erweitert
    { keys: ['Ctrl', 'Shift', 'P'], description: 'Befehlspalette öffnen', category: 'Erweitert' },
    { keys: ['Ctrl', 'F'], description: 'Suchen in WebView', category: 'Erweitert' },
  ], []);

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current && listRef.current) {
      const selectedElement = selectedItemRef.current;
      const listElement = listRef.current;
      
      const selectedRect = selectedElement.getBoundingClientRect();
      const listRect = listElement.getBoundingClientRect();
      
      // Check if the selected item is outside the visible area
      if (selectedRect.top < listRect.top) {
        // Item is above the visible area
        selectedElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } else if (selectedRect.bottom > listRect.bottom) {
        // Item is below the visible area
        selectedElement.scrollIntoView({ block: 'end', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < allShortcuts.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : allShortcuts.length - 1
        );
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  };

  // Group shortcuts by category for rendering
  const groupedShortcuts = useMemo(() => {
    const groups = {};
    allShortcuts.forEach((shortcut, index) => {
      if (!groups[shortcut.category]) {
        groups[shortcut.category] = [];
      }
      groups[shortcut.category].push({ ...shortcut, globalIndex: index });
    });
    return groups;
  }, [allShortcuts]);

  // Category colors
  const categoryColors = {
    Navigation: 'blue.500',
    System: 'green.500',
    Erweitert: 'purple.500',
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      size="xl" 
      closeOnOverlayClick={true}
      closeOnEsc={true}
    >
      <ModalOverlay />
      <ModalContent 
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        maxH="85vh"
        overflow="hidden"
      >
        <ModalHeader>Tastaturkürzel</ModalHeader>
        <ModalCloseButton />
        <ModalBody p={0}>
          <Box 
            ref={listRef}
            maxH="60vh"
            overflowY="auto"
            px={6}
            pt={0}
            pb={6}
          >
            <VStack spacing={6} align="stretch" pt={2}>
            {/* Shortcut Items by Category */}
            {Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
              <Box key={category}>
                <Heading size="sm" mb={3} color={categoryColors[category]}>
                  {category}
                </Heading>
                <VStack 
                  spacing={0} 
                  align="stretch" 
                  bg={sectionBg} 
                  borderRadius="md" 
                  p={3}
                  divider={<Divider borderColor={borderColor} />}
                >
                  {shortcuts.map((shortcut) => (
                    <ShortcutItem 
                      key={shortcut.globalIndex}
                      keys={shortcut.keys}
                      description={shortcut.description}
                      isSelected={shortcut.globalIndex === selectedIndex}
                      itemRef={shortcut.globalIndex === selectedIndex ? selectedItemRef : null}
                    />
                  ))}
                </VStack>
              </Box>
            ))}

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
                Drücken Sie <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>P</Kbd>, um die Befehlspalette zu öffnen. 
                Dort können Sie nach allen Funktionen suchen und diese per Tastatur ausführen.
              </Text>
            </Box>
          </VStack>
          </Box>
        </ModalBody>

        {/* Footer with navigation hints */}
        <Box
          px={4}
          py={2}
          bg={footerBg}
          borderTop="1px"
          borderColor={borderColor}
        >
          <HStack spacing={4} fontSize="xs" color={mutedTextColor}>
            <HStack spacing={1}>
              <Kbd>↑↓</Kbd>
              <Text>Navigieren</Text>
            </HStack>
            <HStack spacing={1}>
              <Kbd>Esc</Kbd>
              <Text>Schließen</Text>
            </HStack>
          </HStack>
        </Box>
      </ModalContent>
    </Modal>
  );
};

export default ShortcutsModal;
