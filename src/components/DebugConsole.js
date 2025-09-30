/**
 * BBZCloud - Debug Console Component
 * 
 * Production-ready debug console for troubleshooting credentials injection
 * and other runtime issues. Activated with Ctrl+Shift+D.
 * 
 * Features:
 * - Real-time log streaming from main and renderer processes
 * - Credential injection flow tracking
 * - WebContentsView lifecycle monitoring
 * - Keyboard shortcut debugging
 * - Exportable logs for bug reports
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 1.0.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  VStack,
  HStack,
  Box,
  Text,
  Button,
  Badge,
  useColorModeValue,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Code,
  IconButton,
  Tooltip,
} from '@chakra-ui/react';

const DebugConsole = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [credentialLogs, setCredentialLogs] = useState([]);
  const [webContentsViewLogs, setWebContentsViewLogs] = useState([]);
  const [keyboardLogs, setKeyboardLogs] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  
  const logsEndRef = useRef(null);
  const credLogsEndRef = useRef(null);
  const wcvLogsEndRef = useRef(null);
  const kbLogsEndRef = useRef(null);

  // Color mode values
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const headerBg = useColorModeValue('gray.50', 'gray.900');
  const logBg = useColorModeValue('gray.50', 'gray.900');
  const errorColor = useColorModeValue('red.600', 'red.300');
  const warningColor = useColorModeValue('orange.600', 'orange.300');
  const infoColor = useColorModeValue('blue.600', 'blue.300');
  const successColor = useColorModeValue('green.600', 'green.300');

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      credLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      wcvLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      kbLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, credentialLogs, webContentsViewLogs, keyboardLogs, autoScroll]);

  // Listen for debug logs from main process
  useEffect(() => {
    if (!window.electron || !window.electron.on) return;

    const handleDebugLog = (data) => {
      const logEntry = {
        ...data,
        timestamp: data.timestamp || Date.now(),
        id: Math.random()
      };

      // Add to general logs
      setLogs(prev => [...prev.slice(-200), logEntry]);

      // Also add to specific category logs
      if (data.type === 'credential-injection') {
        setCredentialLogs(prev => [...prev.slice(-100), logEntry]);
      } else if (data.type === 'webcontentsview') {
        setWebContentsViewLogs(prev => [...prev.slice(-100), logEntry]);
      } else if (data.type === 'keyboard') {
        setKeyboardLogs(prev => [...prev.slice(-100), logEntry]);
      }
    };

    const unsubscribe = window.electron.on('debug-log', handleDebugLog);
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Format timestamp
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('de-DE', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  // Get log level color
  const getLogLevelColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'error': return errorColor;
      case 'warning': return warningColor;
      case 'info': return infoColor;
      case 'success': return successColor;
      default: return 'gray.500';
    }
  };

  // Export logs to clipboard
  const exportLogs = (logsToExport, category = 'all') => {
    const formatted = logsToExport.map(log => 
      `[${formatTime(log.timestamp)}] [${log.type || 'general'}] ${log.message || JSON.stringify(log)}`
    ).join('\n');

    navigator.clipboard.writeText(formatted).then(() => {
      alert(`${category} logs copied to clipboard!`);
    });
  };

  // Clear logs
  const clearLogs = (setter) => {
    setter([]);
  };

  // Render log entry
  const renderLogEntry = (log, index) => (
    <Box
      key={log.id || index}
      p={2}
      mb={1}
      bg={logBg}
      borderRadius="md"
      fontSize="xs"
      fontFamily="monospace"
    >
      <HStack spacing={2} align="flex-start">
        <Text color="gray.500" minW="80px">
          {formatTime(log.timestamp)}
        </Text>
        <Badge colorScheme={log.level === 'error' ? 'red' : log.level === 'warning' ? 'orange' : 'blue'} minW="70px" textAlign="center">
          {log.type || 'general'}
        </Badge>
        <Text flex={1} color={getLogLevelColor(log.level)}>
          {log.message || JSON.stringify(log)}
        </Text>
      </HStack>
      {log.data && (
        <Code mt={1} p={1} w="100%" display="block" fontSize="xs">
          {JSON.stringify(log.data, null, 2)}
        </Code>
      )}
    </Box>
  );

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      size="6xl"
      scrollBehavior="inside"
    >
      <ModalOverlay bg="blackAlpha.600" />
      <ModalContent
        bg={bgColor}
        maxH="90vh"
        maxW="90vw"
      >
        <ModalHeader bg={headerBg} borderBottom="1px" borderColor={borderColor}>
          <HStack justify="space-between">
            <HStack>
              <Text>🔍 BBZCloud Debug Console</Text>
              <Badge colorScheme="purple">Ctrl+Shift+D</Badge>
            </HStack>
            <HStack>
              <Tooltip label="Auto-scroll to new logs">
                <Button
                  size="sm"
                  variant={autoScroll ? 'solid' : 'outline'}
                  colorScheme={autoScroll ? 'blue' : 'gray'}
                  onClick={() => setAutoScroll(!autoScroll)}
                >
                  {autoScroll ? '📜 Auto' : '⏸️ Pause'}
                </Button>
              </Tooltip>
            </HStack>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody p={0}>
          <Tabs>
            <TabList px={4} bg={headerBg} borderBottom="1px" borderColor={borderColor}>
              <Tab>
                All Logs
                <Badge ml={2} colorScheme="gray" fontSize="xs">{logs.length}</Badge>
              </Tab>
              <Tab>
                🔐 Credentials
                <Badge ml={2} colorScheme="blue" fontSize="xs">{credentialLogs.length}</Badge>
              </Tab>
              <Tab>
                🖥️ WebContentsView
                <Badge ml={2} colorScheme="green" fontSize="xs">{webContentsViewLogs.length}</Badge>
              </Tab>
              <Tab>
                ⌨️ Keyboard
                <Badge ml={2} colorScheme="purple" fontSize="xs">{keyboardLogs.length}</Badge>
              </Tab>
            </TabList>

            <TabPanels>
              {/* All Logs */}
              <TabPanel>
                <VStack align="stretch" spacing={2} maxH="60vh" overflowY="auto" p={4}>
                  <HStack justify="space-between" mb={2}>
                    <Text fontSize="sm" fontWeight="bold">General Debug Logs</Text>
                    <HStack>
                      <Button size="xs" onClick={() => exportLogs(logs, 'All')}>
                        📋 Export
                      </Button>
                      <Button size="xs" colorScheme="red" onClick={() => clearLogs(setLogs)}>
                        🗑️ Clear
                      </Button>
                    </HStack>
                  </HStack>
                  {logs.length === 0 ? (
                    <Text color="gray.500" textAlign="center" py={8}>
                      No logs yet. Debug logs will appear here as events occur.
                    </Text>
                  ) : (
                    logs.map((log, index) => renderLogEntry(log, index))
                  )}
                  <div ref={logsEndRef} />
                </VStack>
              </TabPanel>

              {/* Credentials */}
              <TabPanel>
                <VStack align="stretch" spacing={2} maxH="60vh" overflowY="auto" p={4}>
                  <HStack justify="space-between" mb={2}>
                    <Text fontSize="sm" fontWeight="bold">Credential Injection Flow</Text>
                    <HStack>
                      <Button size="xs" onClick={() => exportLogs(credentialLogs, 'Credentials')}>
                        📋 Export
                      </Button>
                      <Button size="xs" colorScheme="red" onClick={() => clearLogs(setCredentialLogs)}>
                        🗑️ Clear
                      </Button>
                    </HStack>
                  </HStack>
                  <Box p={3} bg="blue.50" borderRadius="md" mb={2}>
                    <Text fontSize="xs" fontWeight="bold" mb={1}>💡 Credential Flow:</Text>
                    <Text fontSize="xs">
                      1. Page loads → did-finish-load event<br />
                      2. URL matched to service (webuntis, schulcloud, office, moodle)<br />
                      3. Credentials fetched from keytar<br />
                      4. IPC message sent to preload script<br />
                      5. Preload script injects into DOM<br />
                      6. Success/failure reported back
                    </Text>
                  </Box>
                  {credentialLogs.length === 0 ? (
                    <Text color="gray.500" textAlign="center" py={8}>
                      No credential injection events yet.<br />
                      Navigate to a login page to see the injection flow.
                    </Text>
                  ) : (
                    credentialLogs.map((log, index) => renderLogEntry(log, index))
                  )}
                  <div ref={credLogsEndRef} />
                </VStack>
              </TabPanel>

              {/* WebContentsView */}
              <TabPanel>
                <VStack align="stretch" spacing={2} maxH="60vh" overflowY="auto" p={4}>
                  <HStack justify="space-between" mb={2}>
                    <Text fontSize="sm" fontWeight="bold">WebContentsView Lifecycle</Text>
                    <HStack>
                      <Button size="xs" onClick={() => exportLogs(webContentsViewLogs, 'WebContentsView')}>
                        📋 Export
                      </Button>
                      <Button size="xs" colorScheme="red" onClick={() => clearLogs(setWebContentsViewLogs)}>
                        🗑️ Clear
                      </Button>
                    </HStack>
                  </HStack>
                  {webContentsViewLogs.length === 0 ? (
                    <Text color="gray.500" textAlign="center" py={8}>
                      No WebContentsView events yet.
                    </Text>
                  ) : (
                    webContentsViewLogs.map((log, index) => renderLogEntry(log, index))
                  )}
                  <div ref={wcvLogsEndRef} />
                </VStack>
              </TabPanel>

              {/* Keyboard */}
              <TabPanel>
                <VStack align="stretch" spacing={2} maxH="60vh" overflowY="auto" p={4}>
                  <HStack justify="space-between" mb={2}>
                    <Text fontSize="sm" fontWeight="bold">Keyboard Shortcuts</Text>
                    <HStack>
                      <Button size="xs" onClick={() => exportLogs(keyboardLogs, 'Keyboard')}>
                        📋 Export
                      </Button>
                      <Button size="xs" colorScheme="red" onClick={() => clearLogs(setKeyboardLogs)}>
                        🗑️ Clear
                      </Button>
                    </HStack>
                  </HStack>
                  {keyboardLogs.length === 0 ? (
                    <Text color="gray.500" textAlign="center" py={8}>
                      No keyboard events yet.
                    </Text>
                  ) : (
                    keyboardLogs.map((log, index) => renderLogEntry(log, index))
                  )}
                  <div ref={kbLogsEndRef} />
                </VStack>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default DebugConsole;
