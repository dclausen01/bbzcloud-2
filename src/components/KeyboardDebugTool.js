/**
 * BBZCloud - Keyboard Debug Tool Component
 * 
 * This component provides debugging capabilities for keyboard shortcuts
 * directly within the Electron app context where all APIs are available.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Input,
  Textarea,
  Badge,
  Divider,
  useColorModeValue,
  Heading,
  Code,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
} from '@chakra-ui/react';

const KeyboardDebugTool = () => {
  const [logs, setLogs] = useState([]);
  const [keyLogs, setKeyLogs] = useState([]);
  const [envStatus, setEnvStatus] = useState({});
  const [testResults, setTestResults] = useState({});
  const inputRef = useRef(null);
  const logsRef = useRef(null);

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Add log entry
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      id: Date.now(),
      timestamp,
      message,
      type
    };
    setLogs(prev => [...prev, logEntry]);
    
    // Auto-scroll to bottom
    setTimeout(() => {
      if (logsRef.current) {
        logsRef.current.scrollTop = logsRef.current.scrollHeight;
      }
    }, 100);
  };

  // Check environment on mount
  useEffect(() => {
    checkEnvironment();
    setupConsoleCapture();
  }, []);

  const setupConsoleCapture = () => {
    // Capture console logs
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      originalLog.apply(console, args);
      addLog(args.join(' '), 'info');
    };

    console.warn = (...args) => {
      originalWarn.apply(console, args);
      addLog(args.join(' '), 'warning');
    };

    console.error = (...args) => {
      originalError.apply(console, args);
      addLog(args.join(' '), 'error');
    };

    // Cleanup function
    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  };

  const checkEnvironment = () => {
    const status = {
      electron: !!window.electron,
      electronAPI: !!window.electronAPI,
      onShortcut: !!(window.electron && window.electron.onShortcut),
      sendShortcut: !!(window.electronAPI && window.electronAPI.sendShortcut),
      userAgent: navigator.userAgent,
      platform: navigator.platform
    };
    
    setEnvStatus(status);
    addLog('Environment check completed', 'info');
    
    Object.entries(status).forEach(([key, value]) => {
      addLog(`${key}: ${value}`, value ? 'success' : 'error');
    });
  };

  const handleKeyDown = (event) => {
    const shortcut = getShortcutString(event);
    const logEntry = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      key: event.key,
      code: event.code,
      shortcut,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey
    };
    
    setKeyLogs(prev => [...prev, logEntry]);
    addLog(`Keyboard: ${shortcut} (Key: ${event.key}, Ctrl: ${event.ctrlKey ? 'true' : 'false'}, Shift: ${event.shiftKey ? 'true' : 'false'}, Alt: ${event.altKey ? 'true' : 'false'})`, 'info');

    // Test specific shortcuts
    if (shortcut === 'ctrl+shift+p') {
      addLog('Ctrl+Shift+P detected!', 'success');
      event.preventDefault();
    } else if (shortcut === 'ctrl+2') {
      addLog('Ctrl+2 detected!', 'success');
      event.preventDefault();
    }
  };

  const getShortcutString = (event) => {
    const parts = [];
    if (event.ctrlKey || event.metaKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    
    let key = event.key.toLowerCase();
    const keyMap = {
      ',': 'comma',
      '+': 'plus',
      '-': 'minus',
      '=': 'plus'
    };
    key = keyMap[key] || key;
    parts.push(key);
    
    return parts.join('+');
  };

  const simulateWebViewShortcut = (action) => {
    addLog(`Simulating webview shortcut: ${action}`, 'info');
    
    let success = false;

    // Method 1: electronAPI
    if (window.electronAPI && window.electronAPI.sendShortcut) {
      try {
        window.electronAPI.sendShortcut(action);
        addLog('Sent via electronAPI', 'success');
        success = true;
      } catch (e) {
        addLog(`electronAPI failed: ${e.message}`, 'error');
      }
    }

    // Method 2: electron API
    if (!success && window.electron && window.electron.sendShortcut) {
      try {
        window.electron.sendShortcut(action, 'simulated');
        addLog('Sent via electron API', 'success');
        success = true;
      } catch (e) {
        addLog(`electron API failed: ${e.message}`, 'error');
      }
    }

    // Method 3: postMessage
    if (!success) {
      try {
        window.postMessage({
          type: 'keyboard-shortcut',
          action: action,
          shortcut: 'simulated'
        }, '*');
        addLog('Sent via postMessage', 'success');
        success = true;
      } catch (e) {
        addLog(`postMessage failed: ${e.message}`, 'error');
      }
    }

    if (!success) {
      addLog('All communication methods failed', 'error');
    }
  };

  const testIPC = () => {
    addLog('Testing IPC communication...', 'info');
    
    if (!window.electron) {
      addLog('window.electron not available', 'error');
      return;
    }

    if (window.electron.onShortcut) {
      try {
        const unsubscribe = window.electron.onShortcut((data) => {
          addLog(`IPC received: ${JSON.stringify(data)}`, 'success');
        });

        addLog('IPC listener registered successfully', 'success');

        // Clean up after 10 seconds
        setTimeout(() => {
          if (unsubscribe) unsubscribe();
          addLog('IPC listener cleaned up', 'info');
        }, 10000);

      } catch (e) {
        addLog(`IPC listener failed: ${e.message}`, 'error');
      }
    } else {
      addLog('window.electron.onShortcut not available', 'error');
    }
  };

  const clearLogs = () => {
    setLogs([]);
    setKeyLogs([]);
  };

  const getStatusColor = (type) => {
    switch (type) {
      case 'success': return 'green';
      case 'error': return 'red';
      case 'warning': return 'yellow';
      default: return 'blue';
    }
  };

  return (
    <Box p={4} bg={bgColor} borderRadius="md" border="1px" borderColor={borderColor}>
      <VStack spacing={4} align="stretch">
        <Heading size="md">🔧 Keyboard Shortcuts Debug Tool</Heading>
        
        {/* Environment Status */}
        <Box>
          <Text fontWeight="bold" mb={2}>Environment Status:</Text>
          <VStack spacing={1} align="stretch">
            {Object.entries(envStatus).map(([key, value]) => (
              <HStack key={key} justify="space-between">
                <Text fontSize="sm">{key}:</Text>
                <Badge colorScheme={value ? 'green' : 'red'}>
                  {typeof value === 'boolean' ? (value ? 'Available' : 'Missing') : String(value)}
                </Badge>
              </HStack>
            ))}
          </VStack>
        </Box>

        <Divider />

        {/* Keyboard Test */}
        <Box>
          <Text fontWeight="bold" mb={2}>Keyboard Event Test:</Text>
          <Text fontSize="sm" mb={2}>Click in the input below and press Ctrl+Shift+P or Ctrl+2:</Text>
          <Input
            ref={inputRef}
            placeholder="Press shortcuts here..."
            onKeyDown={handleKeyDown}
            mb={2}
          />
          {keyLogs.length > 0 && (
            <Box maxH="100px" overflowY="auto" bg="gray.50" p={2} borderRadius="md">
              {keyLogs.slice(-5).map(log => (
                <Text key={log.id} fontSize="xs" fontFamily="mono">
                  [{log.timestamp}] {log.shortcut} - Key: {log.key}, Ctrl: {log.ctrl}, Shift: {log.shift}
                </Text>
              ))}
            </Box>
          )}
        </Box>

        <Divider />

        {/* WebView Simulation */}
        <Box>
          <Text fontWeight="bold" mb={2}>WebView Shortcut Simulation:</Text>
          <HStack spacing={2}>
            <Button size="sm" onClick={() => simulateWebViewShortcut('COMMAND_PALETTE')}>
              Simulate Ctrl+Shift+P
            </Button>
            <Button size="sm" onClick={() => simulateWebViewShortcut('NAV_APP_2')}>
              Simulate Ctrl+2
            </Button>
          </HStack>
        </Box>

        <Divider />

        {/* IPC Test */}
        <Box>
          <Text fontWeight="bold" mb={2}>IPC Communication Test:</Text>
          <Button size="sm" onClick={testIPC}>
            Test IPC
          </Button>
        </Box>

        <Divider />

        {/* Debug Console */}
        <Box>
          <HStack justify="space-between" mb={2}>
            <Text fontWeight="bold">Debug Console:</Text>
            <Button size="sm" onClick={clearLogs}>Clear Logs</Button>
          </HStack>
          <Box
            ref={logsRef}
            maxH="200px"
            overflowY="auto"
            bg="gray.50"
            p={3}
            borderRadius="md"
            border="1px"
            borderColor={borderColor}
          >
            {logs.length === 0 ? (
              <Text fontSize="sm" color="gray.500">No logs yet...</Text>
            ) : (
              logs.map(log => (
                <Text
                  key={log.id}
                  fontSize="xs"
                  fontFamily="mono"
                  color={getStatusColor(log.type) + '.600'}
                  mb={1}
                >
                  [{log.timestamp}] {log.message}
                </Text>
              ))
            )}
          </Box>
        </Box>

        {/* Instructions */}
        <Alert status="info" size="sm">
          <AlertIcon />
          <Box>
            <AlertTitle fontSize="sm">Instructions:</AlertTitle>
            <AlertDescription fontSize="xs">
              1. Check environment status above
              2. Test keyboard shortcuts in the input field
              3. Try webview simulation buttons
              4. Monitor debug console for detailed logs
              5. Test IPC communication
            </AlertDescription>
          </Box>
        </Alert>
      </VStack>
    </Box>
  );
};

export default KeyboardDebugTool;
