/**
 * Debug Console - General debugging interface for the application
 * 
 * This component provides real-time monitoring of console messages
 * from both the main React app and all webview instances.
 * Useful for debugging issues across the entire application.
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
  useColorModeValue,
  IconButton,
  Tooltip,
  Select,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon, DeleteIcon } from '@chakra-ui/icons';

const DebugConsole = ({ isVisible }) => {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all'); // all, log, warn, error, info
  const [sourceFilter, setSourceFilter] = useState('all'); // all, main-app, webview
  const [isRecording, setIsRecording] = useState(true);
  const { isOpen: isExpanded, onToggle } = useDisclosure({ defaultIsOpen: true });
  const logIdRef = useRef(0);
  const maxLogs = 200; // Limit stored logs to prevent memory issues

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Add log to the console
  const addLog = (logData) => {
    if (!isRecording) return;

    const log = {
      id: logIdRef.current++,
      timestamp: new Date().toISOString(),
      ...logData,
    };

    setLogs(prev => {
      const newLogs = [log, ...prev].slice(0, maxLogs);
      return newLogs;
    });
  };

  // Intercept console methods for main app
  useEffect(() => {
    if (!isVisible) return;

    // Store original console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    // Override console methods
    console.log = (...args) => {
      originalLog.apply(console, args);
      addLog({
        type: 'log',
        source: 'main-app',
        message: args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '),
        args: args,
      });
    };

    console.warn = (...args) => {
      originalWarn.apply(console, args);
      addLog({
        type: 'warn',
        source: 'main-app',
        message: args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '),
        args: args,
      });
    };

    console.error = (...args) => {
      originalError.apply(console, args);
      addLog({
        type: 'error',
        source: 'main-app',
        message: args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '),
        args: args,
      });
    };

    console.info = (...args) => {
      originalInfo.apply(console, args);
      addLog({
        type: 'info',
        source: 'main-app',
        message: args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '),
        args: args,
      });
    };

    // Restore original console methods on cleanup
    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      console.info = originalInfo;
    };
  }, [isVisible, isRecording]);

  // Listen for console messages from webviews via IPC
  useEffect(() => {
    if (!isVisible || !window.electron?.onMessage) return;

    const handleMessage = (message) => {
      if (message.type === 'console-message') {
        addLog({
          type: message.method || 'log',
          source: 'webview',
          message: message.args?.join(' ') || message.message || '',
          url: message.url || 'unknown',
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

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const typeMatch = filter === 'all' || log.type === filter;
    const sourceMatch = sourceFilter === 'all' || log.source === sourceFilter;
    return typeMatch && sourceMatch;
  });

  // Get log type color
  const getTypeColor = (type) => {
    switch (type) {
      case 'error': return 'red';
      case 'warn': return 'orange';
      case 'info': return 'blue';
      case 'log': return 'gray';
      default: return 'gray';
    }
  };

  // Get source color
  const getSourceColor = (source) => {
    switch (source) {
      case 'webview': return 'cyan';
      case 'main-app': return 'teal';
      default: return 'gray';
    }
  };

  // Clear all logs
  const clearLogs = () => {
    setLogs([]);
    logIdRef.current = 0;
  };

  // Toggle recording
  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  // Count by type
  const counts = logs.reduce((acc, log) => {
    acc[log.type] = (acc[log.type] || 0) + 1;
    acc[log.source] = (acc[log.source] || 0) + 1;
    return acc;
  }, {});

  if (!isVisible) return null;

  return (
    <Box
      position="fixed"
      top="60px"
      right="20px"
      width="600px"
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
          <Text fontWeight="bold" fontSize="sm">Debug Console</Text>
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
          <Tooltip label="Clear Logs">
            <IconButton size="xs" icon={<DeleteIcon />} onClick={clearLogs} />
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
        {/* Stats & Filters */}
        <Box p={3} borderBottom="1px solid" borderColor={borderColor}>
          <HStack spacing={4} fontSize="xs" mb={2}>
            <Text>Total: <strong>{logs.length}</strong></Text>
            <Text color="gray.500">Log: <strong>{counts.log || 0}</strong></Text>
            <Text color="blue.500">Info: <strong>{counts.info || 0}</strong></Text>
            <Text color="orange.500">Warn: <strong>{counts.warn || 0}</strong></Text>
            <Text color="red.500">Error: <strong>{counts.error || 0}</strong></Text>
          </HStack>
          <HStack spacing={2}>
            <Select size="xs" value={filter} onChange={(e) => setFilter(e.target.value)} width="120px">
              <option value="all">All Types</option>
              <option value="log">Log</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </Select>
            <Select size="xs" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} width="120px">
              <option value="all">All Sources</option>
              <option value="main-app">Main App</option>
              <option value="webview">WebView</option>
            </Select>
          </HStack>
        </Box>

        {/* Logs List */}
        <Box maxHeight="500px" overflowY="auto">
          {filteredLogs.length === 0 ? (
            <Box p={4} textAlign="center">
              <Text fontSize="sm" color="gray.500">
                No logs captured yet. Console messages will appear here.
              </Text>
            </Box>
          ) : (
            <Table size="sm">
              <Thead position="sticky" top={0} bg={bgColor} zIndex={1}>
                <Tr>
                  <Th fontSize="xs" width="80px">Time</Th>
                  <Th fontSize="xs" width="80px">Source</Th>
                  <Th fontSize="xs" width="60px">Type</Th>
                  <Th fontSize="xs">Message</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredLogs.map((log) => (
                  <Tr key={log.id} fontSize="xs">
                    <Td>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </Td>
                    <Td>
                      <Badge size="sm" colorScheme={getSourceColor(log.source)}>
                        {log.source === 'main-app' ? 'Main' : 'WebView'}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge size="sm" colorScheme={getTypeColor(log.type)}>
                        {log.type}
                      </Badge>
                    </Td>
                    <Td>
                      <Code fontSize="xs" maxW="400px" overflowX="auto" display="block" whiteSpace="pre-wrap">
                        {log.message}
                      </Code>
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
              <AlertTitle>Debug Console</AlertTitle>
              <AlertDescription>
                Captures console.log, console.warn, console.error, and console.info from both the main app and all webviews.
                Use filters to narrow down specific types or sources.
              </AlertDescription>
            </Box>
          </Alert>
        </Box>
      </Collapse>
    </Box>
  );
};

export default DebugConsole;
