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
  Icon,
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
  const { settings } = useSettings();

  // Color mode values
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const hoverBg = useColorModeValue('gray.100', 'gray.700');
  const selectedBg = useColorModeValue('blue.100', 'blue.900');
  const textColor = useColorModeValue('gray.800', 'white');
  const mutedTextColor = useColorModeValue('gray.600', 'gray.400');

  // Generate all available commands
  const allCommands = useMemo(() => {
    const commands = [];

    // Navigation commands
    Object.entries(navigationButtons).forEach(([id, config]) => {
      if (config.visible) {
        commands.push({
          id: `nav-${id}`,
          title: config.title,
          description: `Navigate to ${config.title}`,
          category: 'Navigation',
          icon: '🔗',
          action: () => {
            onNavigate?.(id, false);
            onClose();
          },
          shortcut: commands.length < 9 ? `Ctrl+${commands.length + 1}` : null,
        });
      }
    });

    // Application commands
    const appCommands = [
      {
        id: 'open-settings',
        title: 'Open Settings',
        description: 'Open the settings panel',
        category: 'Application',
        icon: '⚙️',
        action: () => {
          onOpenSettings?.();
          onClose();
        },
        shortcut: 'Ctrl+,',
      },
      {
        id: 'toggle-todo',
        title: 'Toggle Todo List',
        description: 'Open or close the todo list drawer',
        category: 'Application',
        icon: '📝',
        action: () => {
          onToggleTodo?.();
          onClose();
        },
        shortcut: 'Ctrl+Shift+O',
      },
      {
        id: 'toggle-secure-docs',
        title: 'Toggle Secure Documents',
        description: 'Open or close the secure documents drawer',
        category: 'Application',
        icon: '🔒',
        action: () => {
          onToggleSecureDocs?.();
          onClose();
        },
        shortcut: 'Ctrl+D',
      },
      {
        id: 'reload-current',
        title: 'Reload Current Page',
        description: 'Reload the currently active webview',
        category: 'WebView',
        icon: '🔄',
        action: () => {
          onReloadCurrent?.();
          onClose();
        },
        shortcut: 'Ctrl+R',
      },
      {
        id: 'reload-all',
        title: 'Reload All Pages',
        description: 'Reload all webviews in the application',
        category: 'WebView',
        icon: '🔄',
        action: () => {
          onReloadAll?.();
          onClose();
        },
        shortcut: 'Ctrl+Shift+R',
      },
    ];

    commands.push(...appCommands);

    // Custom apps from settings
    if (settings.customApps) {
      settings.customApps.forEach((app) => {
        commands.push({
          id: `custom-${app.id}`,
          title: app.title,
          description: `Navigate to ${app.title}`,
          category: 'Custom Apps',
          icon: '🚀',
          action: () => {
            onNavigate?.(app.id, false);
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
            <Box maxH="50vh" overflowY="auto">
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
                        bg={useColorModeValue('gray.50', 'gray.900')}
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
              bg={useColorModeValue('gray.50', 'gray.900')}
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
