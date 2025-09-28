/**
 * Keyboard Debug Tool - Visual debugging interface for keyboard shortcuts
 * 
 * This component provides real-time monitoring of keyboard shortcut events
 * throughout the entire application pipeline, helping identify where shortcuts
 * are failing in the webview → preload → main process → React app flow.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Button,
  Collapse,
  useDisclosure,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Code,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Divider,
  useColorModeValue,
  IconButton,
  Tooltip,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon, DeleteIcon } from '@chakra-ui/icons';
import { KEYBOARD_SHORTCUTS } from '../utils/constants';

const KeyboardDebugTool = ({ isVisible }) => {
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({
    totalEvents: 0,
    webviewEvents: 0,
    mainAppEvents: 0,
    successfulEvents: 0,
    failedEvents: 0,
  });
  const [isRecording, setIsRecording] = useState(true);
  const { isOpen: isExpanded, onToggle } = useDisclosure({ defaultIsOpen: true });
  const eventIdRef = useRef(0);
  const maxEvents = 100; // Limit stored events to prevent memory issues

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Add event to the log
  const addEvent = (eventData) => {
    if (!isRecording) return;

    const event = {
      id: eventIdRef.current++,
      timestamp: new Date().toISOString(),
      ...eventData,
    };

    setEvents(prev => {
      const newEvents = [event, ...prev].slice(0, maxEvents);
      return newEvents;
    });

    setStats(prev => ({
      totalEvents: prev.totalEvents + 1,
      webviewEvents: prev.webviewEvents + (eventData.source === 'webview' ? 1 : 0),
      mainAppEvents: prev.mainAppEvents + (eventData.source === 'main-app' ? 1 : 0),
      successfulEvents: prev.successfulEvents + (eventData.status === 'success' ? 1 : 0),
      failedEvents: prev.failedEvents + (eventData.status === 'failed' ? 1 : 0),
    }));
  };

  // Set up global keyboard event listener for main app events
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (event) => {
      console.log('[Debug Tool] Raw keydown event:', {
        key: event.key,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        target: event.target.tagName
      });

      const shortcutString = getShortcutString(event);
      const matchedShortcut = findMatchingShortcut(shortcutString);
      
      console.log('[Debug Tool] Processed shortcut:', {
        shortcutString,
        matchedShortcut,
        isRecording
      });
      
      addEvent({
        type: 'keydown',
        source: 'main-app',
        shortcut: shortcutString,
        key: event.key,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        target: event.target.tagName,
        matched: !!matchedShortcut,
        action: matchedShortcut?.action || 'unknown',
        status: 'captured',
        activeElement: document.activeElement?.tagName || 'unknown',
        url: window.location.href,
      });
    };

    // Add multiple event listeners to catch all possible events
    document.addEventListener('keydown', handleKeyDown, true); // Capture phase
    document.addEventListener('keydown', handleKeyDown, false); // Bubble phase
    window.addEventListener('keydown', handleKeyDown, true); // Window level
    
    console.log('[Debug Tool] Event listeners attached');
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keydown', handleKeyDown, false);
      window.removeEventListener('keydown', handleKeyDown, true);
      console.log('[Debug Tool] Event listeners removed');
    };
  }, [isVisible, isRecording]);

  // Set up IPC message listener for webview events
  useEffect(() => {
    if (!isVisible || !window.electron?.onMessage) return;

    const handleMessage = (message) => {
      console.log('[Debug Tool] Received IPC message:', message);
      
      if (message.type === 'debug-keyboard-event') {
        // Debug event from webview preload script
        addEvent({
          type: 'webview-keydown',
          source: 'webview',
          shortcut: message.shortcut,
          key: message.key,
          ctrlKey: message.ctrlKey,
          altKey: message.altKey,
          shiftKey: message.shiftKey,
          target: message.target,
          isInInputField: message.isInInputField,
          action: 'debug-capture',
          status: 'captured',
          url: message.url,
        });
      } else if (message.type === 'webview-shortcut' || message.type === 'keyboard-shortcut') {
        // Actual shortcut execution
        addEvent({
          type: 'ipc-message',
          source: 'webview',
          messageType: message.type,
          action: message.action,
          shortcut: message.shortcut || 'unknown',
          status: 'received',
          data: message,
        });
      }
    };

    const unsubscribe = window.electron.onMessage(handleMessage);
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isVisible, isRecording]);

  // Helper function to convert keyboard event to shortcut string
  const getShortcutString = (event) => {
    const parts = [];
    if (event.ctrlKey || event.metaKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    
    let key = event.key.toLowerCase();
    const keyMap = {
      ' ': 'space',
      'escape': 'escape',
      'arrowup': 'up',
      'arrowdown': 'down',
      'arrowleft': 'left',
      'arrowright': 'right',
      '+': 'plus',
      '-': 'minus',
      '=': 'equal',
      ',': 'comma',
    };
    
    key = keyMap[key] || key;
    parts.push(key);
    
    return parts.join('+');
  };

  // Find matching shortcut from constants
  const findMatchingShortcut = (shortcutString) => {
    for (const [action, shortcut] of Object.entries(KEYBOARD_SHORTCUTS)) {
      if (shortcut === shortcutString) {
        return { action, shortcut };
      }
    }
    return null;
  };

  // Clear all events
  const clearEvents = () => {
    setEvents([]);
    setStats({
      totalEvents: 0,
      webviewEvents: 0,
      mainAppEvents: 0,
      successfulEvents: 0,
      failedEvents: 0,
    });
    eventIdRef.current = 0;
  };

  // Toggle recording
  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  // Test a specific shortcut
  const testShortcut = (shortcut) => {
    addEvent({
      type: 'test',
      source: 'debug-tool',
      shortcut,
      status: 'testing',
      action: 'manual-test',
      timestamp: new Date().toISOString(),
    });
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'green';
      case 'failed': return 'red';
      case 'captured': return 'blue';
      case 'received': return 'purple';
      case 'testing': return 'orange';
      default: return 'gray';
    }
  };

  // Get source color
  const getSourceColor = (source) => {
    switch (source) {
      case 'webview': return 'cyan';
      case 'main-app': return 'teal';
      case 'debug-tool': return 'orange';
      default: return 'gray';
    }
  };

  if (!isVisible) return null;

  return (
    <Box
      position="fixed"
      top="60px"
      right="20px"
      width="500px"
      maxHeight="80vh"
      bg={bgColor}
      border="1px solid"
      borderColor={borderColor}
      borderRadius="md"
      boxShadow="lg"
      zIndex={9999}
      overflow="hidden"
    >
      {/* Header */}
      <HStack p={3} borderBottom="1px solid" borderColor={borderColor} justify="space-between">
        <HStack>
          <Text fontWeight="bold" fontSize="sm">Keyboard Debug Tool</Text>
          <Badge colorScheme={isRecording ? 'green' : 'red'}>
            {isRecording ? 'Recording' : 'Paused'}
          </Badge>
        </HStack>
        <HStack spacing={1}>
          <Tooltip label={isRecording ? 'Pause Recording' : 'Start Recording'}>
            <Button size="xs" onClick={toggleRecording} colorScheme={isRecording ? 'red' : 'green'}>
              {isRecording ? 'Pause' : 'Record'}
            </Button>
          </Tooltip>
          <Tooltip label="Clear Events">
            <IconButton size="xs" icon={<DeleteIcon />} onClick={clearEvents} />
          </Tooltip>
          <Tooltip label={isExpanded ? 'Collapse' : 'Expand'}>
            <IconButton
              size="xs"
              icon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
              onClick={onToggle}
            />
          </Tooltip>
        </HStack>
      </HStack>

      <Collapse in={isExpanded}>
        {/* Stats */}
        <Box p={3} borderBottom="1px solid" borderColor={borderColor}>
          <HStack spacing={4} fontSize="xs">
            <Text>Total: <strong>{stats.totalEvents}</strong></Text>
            <Text>WebView: <strong>{stats.webviewEvents}</strong></Text>
            <Text>Main App: <strong>{stats.mainAppEvents}</strong></Text>
            <Text color="green.500">Success: <strong>{stats.successfulEvents}</strong></Text>
            <Text color="red.500">Failed: <strong>{stats.failedEvents}</strong></Text>
          </HStack>
        </Box>

        {/* Quick Test Buttons */}
        <Box p={3} borderBottom="1px solid" borderColor={borderColor}>
          <Text fontSize="xs" fontWeight="bold" mb={2}>Quick Tests:</Text>
          <HStack spacing={2} flexWrap="wrap" mb={2}>
            {Object.entries(KEYBOARD_SHORTCUTS).slice(0, 6).map(([action, shortcut]) => (
              <Button
                key={action}
                size="xs"
                variant="outline"
                onClick={() => testShortcut(shortcut)}
              >
                {shortcut}
              </Button>
            ))}
          </HStack>
          <Button
            size="xs"
            colorScheme="blue"
            onClick={() => {
              console.log('[Debug Tool] Manual test button clicked');
              addEvent({
                type: 'manual-test',
                source: 'debug-tool',
                shortcut: 'test-button',
                action: 'manual-test',
                status: 'testing',
              });
            }}
          >
            Test Debug Tool
          </Button>
        </Box>

        {/* Events List */}
        <Box maxHeight="400px" overflowY="auto">
          {events.length === 0 ? (
            <Box p={4} textAlign="center">
              <Text fontSize="sm" color="gray.500">
                No events captured yet. Press some keyboard shortcuts to see them here.
              </Text>
            </Box>
          ) : (
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th fontSize="xs">Time</Th>
                  <Th fontSize="xs">Source</Th>
                  <Th fontSize="xs">Shortcut</Th>
                  <Th fontSize="xs">Action</Th>
                  <Th fontSize="xs">Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {events.map((event) => (
                  <Tr key={event.id} fontSize="xs">
                    <Td>
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </Td>
                    <Td>
                      <Badge size="sm" colorScheme={getSourceColor(event.source)}>
                        {event.source}
                      </Badge>
                    </Td>
                    <Td>
                      <Code fontSize="xs">{event.shortcut}</Code>
                    </Td>
                    <Td>{event.action}</Td>
                    <Td>
                      <Badge size="sm" colorScheme={getStatusColor(event.status)}>
                        {event.status}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Box>

        {/* Instructions */}
        <Box p={3} borderTop="1px solid" borderColor={borderColor}>
          <Alert status="info" size="sm">
            <AlertIcon />
            <Box fontSize="xs">
              <AlertTitle>How to use:</AlertTitle>
              <AlertDescription>
                1. Focus a webview (like schul.cloud)<br/>
                2. Press keyboard shortcuts<br/>
                3. Watch events appear in real-time<br/>
                4. Look for failed events or missing handlers
              </AlertDescription>
            </Box>
          </Alert>
        </Box>
      </Collapse>
    </Box>
  );
};

export default KeyboardDebugTool;
