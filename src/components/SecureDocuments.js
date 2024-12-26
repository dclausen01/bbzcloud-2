import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  VStack,
  Text,
  useToast,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useColorMode,
} from '@chakra-ui/react';

const { ipcRenderer } = window.electron;

function SecureDocuments() {
  const [files, setFiles] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const toast = useToast();
  const { colorMode } = useColorMode();

  const loadFiles = useCallback(async () => {
    if (!isReady) return;
    const result = await ipcRenderer.invoke('list-secure-files');
    if (result.success) {
      setFiles(result.files);
    }
  }, [isReady]);

  const checkAccess = async () => {
    try {
      const result = await ipcRenderer.invoke('check-secure-store-access');
      if (result.success && result.hasPassword) {
        setIsReady(true);
      } else {
        setIsReady(false);
        if (!result.success) {
          console.error('Error checking secure store access:', result.error);
          toast({
            title: 'Fehler',
            description: result.error || 'Fehler beim Prüfen der Zugangsdaten',
            status: 'error',
            duration: 5000,
          });
        } else {
          toast({
            title: 'Fehler',
            description: 'Bitte setzen Sie zuerst ein Passwort in den Einstellungen unter "Zugangsdaten".',
            status: 'error',
            duration: 5000,
          });
        }
      }
    } catch (error) {
      console.error('Error checking secure store access:', error);
      setIsReady(false);
      toast({
        title: 'Fehler',
        description: 'Fehler beim Prüfen der Zugangsdaten',
        status: 'error',
        duration: 5000,
      });
    }
  };

  useEffect(() => {
    checkAccess();
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const result = await ipcRenderer.invoke('encrypt-and-store-file', {
      path: file.path,
      name: file.name,
    });

    if (result.success) {
      loadFiles();
      toast({
        title: 'Erfolg',
        description: 'Datei wurde verschlüsselt gespeichert.',
        status: 'success',
        duration: 3000,
      });
    } else {
      toast({
        title: 'Fehler',
        description: result.error || 'Fehler beim Speichern der Datei.',
        status: 'error',
        duration: 3000,
      });
    }
  };

  const handleFileClick = async (file) => {
    const result = await ipcRenderer.invoke('open-secure-file', file.id);
    if (!result.success) {
      toast({
        title: 'Fehler',
        description: result.error || 'Fehler beim Öffnen der Datei.',
        status: 'error',
        duration: 3000,
      });
    }
  };

  if (!isReady) {
    return (
      <Box p={4}>
        <Text>Bitte setzen Sie ein Passwort in den Einstellungen unter "Zugangsdaten", um sichere Dokumente zu verwenden.</Text>
      </Box>
    );
  }

  return (
    <Box p={4}>
      <VStack spacing={4} align="stretch">
        <Button
          as="label"
          htmlFor="file-upload"
          colorScheme="blue"
          size="sm"
          cursor="pointer"
        >
          Datei hochladen
          <input
            id="file-upload"
            type="file"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
        </Button>

        <Table variant="simple" size="sm">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Größe</Th>
              <Th>Datum</Th>
            </Tr>
          </Thead>
          <Tbody>
            {files.map((file) => (
              <Tr
                key={file.id}
                onClick={() => handleFileClick(file)}
                cursor="pointer"
                _hover={{ bg: colorMode === 'light' ? 'gray.100' : 'gray.700' }}
              >
                <Td>{file.name}</Td>
                <Td>{file.size}</Td>
                <Td>{new Date(file.date).toLocaleString()}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </VStack>
    </Box>
  );
}

export default SecureDocuments;
