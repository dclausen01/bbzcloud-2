/**
 * BBZCloud - Command Palette Component
 * 
 * A VS Code-style command palette that provides quick access to all application
 * functions and navigation. Supports fuzzy search and keyboard navigation.
 * 
 * Features:
 * - Fuzzy search through all available commands
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Quick app switching
 * - Application actions (reload, settings, etc.)
 * - Accessible design with proper ARIA labels
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.0.38
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  Input,
  VStack,
  HStack,
  Text,
  Box,
  useColorModeValue,
  Kbd,
} from '@chakra-ui/react';
import { useSettings } from '../context/SettingsContext';

/**
 * Fuzzy search function to match commands
 * @param {string} query - Search query
 * @param {string} text - Text to search in
 * @returns {boolean} - Whether the text matches the query
 */
const fuzzyMatch = (query, text) => {
  if (!query) return true;
  
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Simple fuzzy matching - check if all characters in query exist in order
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  
  return queryIndex === queryLower.length;
};

/**
 * Command Palette Component
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the palette is open
 * @param {Function} props.onClose - Function to close the palette
 * @param {Object} props.navigationButtons - Available navigation buttons
 * @param {Function} props.onNavigate - Function to handle navigation
 * @param {Function} props.onOpenSettings - Function to open settings
 * @param {Function} props.onToggleTodo - Function to toggle todo drawer
 * @param {Function} props.onToggleSecureDocs - Function to toggle secure docs drawer
 * @param {Function} props.onReloadCurrent - Function to reload current webview
 * @param {Function} props.onReloadAll - Function to reload all webviews
 */
const CommandPalette = ({
  isOpen,
  onClose,
  navigationButtons = {},
  onNavigate,
  onOpenSettings,
  onToggleTodo,
  onToggleSecureDocs,
  onReloadCurrent,
  onReloadAll,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const selectedItemRef = useRef(null);
  const { settings } = useSettings();

  // Color mode values
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const hoverBg = useColorModeValue('gray.100', 'gray.700');
  const selectedBg = useColorModeValue('blue.100', 'blue.900');
  const textColor = useColorModeValue('gray.800', 'white');
  const mutedTextColor = useColorModeValue('gray.600', 'gray.400');
  const categoryHeaderBg = useColorModeValue('gray.50', 'gray.900');
  const footerBg = useColorModeValue('gray.50', 'gray.900');

  // Generate all available commands
  const allCommands = useMemo(() => {
    const commands = [];

    // Navigation commands
    Object.entries(navigationButtons).forEach(([id, config]) => {
      if (config.visible) {
        commands.push({
          id: `nav-${id}`,
          title: config.title,
          description: `Zu ${config.title} navigieren`,
          category: 'Navigation',
          icon: '🔗',
          action: () => {
            onNavigate?.(id, false);
            onClose();
          },
          shortcut: commands.length < 9 ? `Strg+${commands.length + 1}` : null,
        });
      }
    });

    // Application commands
    const appCommands = [
      {
        id: 'open-settings',
        title: 'Einstellungen öffnen',
        description: 'Das Einstellungsmenü öffnen',
        category: 'Anwendung',
        icon: '⚙️',
        action: () => {
          onOpenSettings?.();
          onClose();
        },
        shortcut: 'Strg+,',
      },
      {
        id: 'toggle-todo',
        title: 'Todo-Liste umschalten',
        description: 'Todo-Liste öffnen oder schließen',
        category: 'Anwendung',
        icon: '📝',
        action: () => {
          onToggleTodo?.();
          onClose();
        },
        shortcut: 'Strg+Shift+T',
      },
      {
        id: 'toggle-secure-docs',
        title: 'Sichere Dokumente umschalten',
        description: 'Sichere Dokumente öffnen oder schließen',
        category: 'Anwendung',
        icon: '🔒',
        action: () => {
          onToggleSecureDocs?.();
          onClose();
        },
        shortcut: 'Strg+D',
      },
      {
        id: 'reload-current',
        title: 'Aktuelle Seite neu laden',
        description: 'Die aktuell aktive Webansicht neu laden',
        category: 'WebView',
        icon: '🔄',
        action: () => {
          onReloadCurrent?.();
          onClose();
        },
        shortcut: 'Strg+R',
      },
      {
        id: 'reload-all',
        title: 'Alle Seiten neu laden',
        description: 'Alle Webansichten in der Anwendung neu laden',
        category: 'WebView',
        icon: '🔄',
        action: () => {
          onReloadAll?.();
          onClose();
        },
        shortcut: 'Strg+Shift+R',
      },
    ];

    commands.push(...appCommands);

    // Custom apps from settings
    if (settings.customApps) {
      settings.customApps.forEach((app) => {
        commands.push({
          id: `custom-${app.id}`,
          title: `${app.title} in neuem Fenster öffnen`,
          description: `${app.title} in einem neuen Fenster öffnen`,
          category: 'Benutzerdefinierte Apps',
          icon: '🚀',
          action: () => {
            if (window.electron && window.electron.openExternalWindow) {
              window.electron.openExternalWindow({ url: app.url, title: app.title });
            }
            onClose();
          },
        });
      });
    }

    return commands;
  }, [navigationButtons, settings.customApps, onNavigate, onOpenSettings, onToggleTodo, onToggleSecureDocs, onReloadCurrent, onReloadAll, onClose]);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return allCommands;
    
    return allCommands.filter(command => 
      fuzzyMatch(query, command.title) || 
      fuzzyMatch(query, command.description) ||
      fuzzyMatch(query, command.category)
    );
  }, [allCommands, query]);

  // Reset selection when filtered commands change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
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
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  };

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups = {};
    filteredCommands.forEach(command => {
      if (!groups[command.category]) {
        groups[command.category] = [];
      }
      groups[command.category].push(command);
    });
    return groups;
  }, [filteredCommands]);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      size="xl" 
      motionPreset="slideInTop"
      closeOnOverlayClick={true}
      closeOnEsc={true}
    >
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      <ModalContent
        bg={bgColor}
        border="1px"
        borderColor={borderColor}
        borderRadius="lg"
        boxShadow="2xl"
        mx={4}
        mt="10vh"
        maxH="70vh"
        overflow="hidden"
      >
        <ModalBody p={0}>
          <VStack spacing={0} align="stretch">
            {/* Search Input */}
            <Box p={4} borderBottom="1px" borderColor={borderColor}>
              <Input
                ref={inputRef}
                placeholder="Type a command or search..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                variant="unstyled"
                fontSize="lg"
                color={textColor}
                _placeholder={{ color: mutedTextColor }}
              />
            </Box>

            {/* Commands List */}
            <Box ref={listRef} maxH="50vh" overflowY="auto">
              {Object.keys(groupedCommands).length === 0 ? (
                <Box p={8} textAlign="center">
                  <Text color={mutedTextColor}>No commands found</Text>
                </Box>
              ) : (
                <VStack spacing={0} align="stretch">
                  {Object.entries(groupedCommands).map(([category, commands]) => (
                    <Box key={category}>
                      {/* Category Header */}
                      <Box
                        px={4}
                        py={2}
                        bg={categoryHeaderBg}
                        borderBottom="1px"
                        borderColor={borderColor}
                      >
                        <Text
                          fontSize="xs"
                          fontWeight="semibold"
                          color={mutedTextColor}
                          textTransform="uppercase"
                          letterSpacing="wide"
                        >
                          {category}
                        </Text>
                      </Box>

                      {/* Commands in Category */}
                      {commands.map((command, index) => {
                        const globalIndex = filteredCommands.indexOf(command);
                        const isSelected = globalIndex === selectedIndex;

                        return (
                          <Box
                            key={command.id}
                            ref={isSelected ? selectedItemRef : null}
                            px={4}
                            py={3}
                            bg={isSelected ? selectedBg : 'transparent'}
                            _hover={{ bg: hoverBg }}
                            cursor="pointer"
                            onClick={() => command.action()}
                            borderBottom="1px"
                            borderColor={borderColor}
                            transition="background-color 0.1s"
                          >
                            <HStack justify="space-between" align="center">
                              <HStack spacing={3} flex={1} minW={0}>
                                <Text fontSize="lg">{command.icon}</Text>
                                <Box flex={1} minW={0}>
                                  <Text
                                    fontWeight="medium"
                                    color={textColor}
                                    noOfLines={1}
                                  >
                                    {command.title}
                                  </Text>
                                  <Text
                                    fontSize="sm"
                                    color={mutedTextColor}
                                    noOfLines={1}
                                  >
                                    {command.description}
                                  </Text>
                                </Box>
                              </HStack>
                              {command.shortcut && (
                                <Kbd fontSize="xs" color={mutedTextColor}>
                                  {command.shortcut}
                                </Kbd>
                              )}
                            </HStack>
                          </Box>
                        );
                      })}
                    </Box>
                  ))}
                </VStack>
              )}
            </Box>

            {/* Footer */}
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
                  <Text>Navigate</Text>
                </HStack>
                <HStack spacing={1}>
                  <Kbd>Enter</Kbd>
                  <Text>Select</Text>
                </HStack>
                <HStack spacing={1}>
                  <Kbd>Esc</Kbd>
                  <Text>Close</Text>
                </HStack>
              </HStack>
            </Box>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default CommandPalette;
