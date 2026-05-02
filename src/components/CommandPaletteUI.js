/**
 * CommandPaletteUI
 *
 * Pure presentation component for the command palette. Renders inline (no
 * Modal/Drawer wrapper) so it can be hosted either inside the main window
 * (legacy) or inside the dedicated overlay BrowserWindow.
 *
 * Receives commands as serialisable metadata only — actions are dispatched
 * back to the parent via onSelect(commandId). This makes the component
 * suitable for cross-window IPC.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  Input,
  VStack,
  HStack,
  Text,
  useColorModeValue,
  Kbd,
} from '@chakra-ui/react';

const fuzzyMatch = (query, text) => {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = (text || '').toLowerCase();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
};

const CommandPaletteUI = ({ commands = [], onSelect, onClose, autoFocus = true }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const selectedItemRef = useRef(null);

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const hoverBg = useColorModeValue('gray.100', 'gray.700');
  const selectedBg = useColorModeValue('blue.100', 'blue.900');
  const textColor = useColorModeValue('gray.800', 'white');
  const mutedTextColor = useColorModeValue('gray.600', 'gray.400');
  const categoryHeaderBg = useColorModeValue('gray.50', 'gray.900');
  const footerBg = useColorModeValue('gray.50', 'gray.900');

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    return commands.filter(cmd =>
      fuzzyMatch(query, cmd.title) ||
      fuzzyMatch(query, cmd.description) ||
      fuzzyMatch(query, cmd.category)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    if (selectedItemRef.current && listRef.current) {
      const sel = selectedItemRef.current;
      const list = listRef.current;
      const sr = sel.getBoundingClientRect();
      const lr = list.getBoundingClientRect();
      if (sr.top < lr.top) sel.scrollIntoView({ block: 'start', behavior: 'smooth' });
      else if (sr.bottom > lr.bottom) sel.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => prev < filteredCommands.length - 1 ? prev + 1 : 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : filteredCommands.length - 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          onSelect?.(filteredCommands[selectedIndex].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose?.();
        break;
      default:
        break;
    }
  };

  const groupedCommands = useMemo(() => {
    const groups = {};
    filteredCommands.forEach(cmd => {
      const key = cmd.category || 'Andere';
      if (!groups[key]) groups[key] = [];
      groups[key].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  return (
    <Box
      bg={bgColor}
      border="1px"
      borderColor={borderColor}
      borderRadius="lg"
      boxShadow="2xl"
      maxH="70vh"
      overflow="hidden"
      display="flex"
      flexDirection="column"
    >
      {/* Search input */}
      <Box p={4} borderBottom="1px" borderColor={borderColor} flexShrink={0}>
        <Input
          ref={inputRef}
          placeholder="Befehl eingeben oder suchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          variant="unstyled"
          fontSize="lg"
          color={textColor}
          _placeholder={{ color: mutedTextColor }}
        />
      </Box>

      {/* Commands list */}
      <Box ref={listRef} flex="1" overflowY="auto" minH={0}>
        {Object.keys(groupedCommands).length === 0 ? (
          <Box p={8} textAlign="center">
            <Text color={mutedTextColor}>Keine Befehle gefunden</Text>
          </Box>
        ) : (
          <VStack spacing={0} align="stretch">
            {Object.entries(groupedCommands).map(([category, cmds]) => (
              <Box key={category}>
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
                {cmds.map((cmd) => {
                  const globalIndex = filteredCommands.indexOf(cmd);
                  const isSelected = globalIndex === selectedIndex;
                  return (
                    <Box
                      key={cmd.id}
                      ref={isSelected ? selectedItemRef : null}
                      px={4}
                      py={3}
                      bg={isSelected ? selectedBg : 'transparent'}
                      _hover={{ bg: hoverBg }}
                      cursor="pointer"
                      onClick={() => onSelect?.(cmd.id)}
                      borderBottom="1px"
                      borderColor={borderColor}
                      transition="background-color 0.1s"
                    >
                      <HStack justify="space-between" align="center">
                        <HStack spacing={3} flex={1} minW={0}>
                          {cmd.icon && <Text fontSize="lg">{cmd.icon}</Text>}
                          <Box flex={1} minW={0}>
                            <Text fontWeight="medium" color={textColor} noOfLines={1}>
                              {cmd.title}
                            </Text>
                            {cmd.description && (
                              <Text fontSize="sm" color={mutedTextColor} noOfLines={1}>
                                {cmd.description}
                              </Text>
                            )}
                          </Box>
                        </HStack>
                        {cmd.shortcut && (
                          <Kbd fontSize="xs" color={mutedTextColor}>
                            {cmd.shortcut}
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
        flexShrink={0}
      >
        <HStack spacing={4} fontSize="xs" color={mutedTextColor}>
          <HStack spacing={1}><Kbd>↑↓</Kbd><Text>Navigieren</Text></HStack>
          <HStack spacing={1}><Kbd>Enter</Kbd><Text>Auswählen</Text></HStack>
          <HStack spacing={1}><Kbd>Esc</Kbd><Text>Schließen</Text></HStack>
        </HStack>
      </Box>
    </Box>
  );
};

export default CommandPaletteUI;
