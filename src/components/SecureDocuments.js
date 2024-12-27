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
  IconButton,
  useDisclosure,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
} from '@chakra-ui/react';
import { DeleteIcon } from '@chakra-ui/icons';

function SecureDocuments() {
  const [files, setFiles] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [fileToDelete, setFileToDelete] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const cancelRef = React.useRef();
  const toast = useToast();
  const { colorMode } = useColorMode();

  const loadFiles = useCallback(async () => {
    if (!isReady) return;
    const result = await window.electron.listSecureFiles();
    if (result.success) {
      setFiles(result.files);
    }
  }, [isReady]);

  // Listen for file updates
  useEffect(() => {
    const handleFileUpdate = () => {
      loadFiles();
    };
    
    window.electron.on('secure-file-updated', handleFileUpdate);
    
    return () => {
      window.electron.off('secure-file-updated', handleFileUpdate);
    };
  }, [loadFiles]);

  const sleep = useCallback((ms) => new Promise(resolve => setTimeout(resolve, ms)), []);

  const checkAccess = useCallback(async () => {
    console.log('Checking secure store access from frontend, attempt:', retryCount + 1);
    try {
      // Add a longer initial delay to ensure keytar is ready
      await sleep(1000);
      
      // Use the same direct approach as WebViewContainer
      const result = await window.electron.getCredentials({ 
        service: 'bbzcloud', 
        account: 'password' 
      });
      
      if (result.success && result.password) {
        setIsReady(true);
        return;
      }
      
      if (retryCount < 5) {  // Increased retries
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
        }, 2000);  // Increased delay between retries
      } else {
        console.log('Max retries reached, showing error');
        toast({
          title: 'Fehler',
          description: 'Bitte setzen Sie zuerst ein Passwort in den Einstellungen.',
          status: 'error',
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Error checking access:', error);
      toast({
        title: 'Fehler',
        description: 'Fehler beim Zugriff auf die Zugangsdaten.',
        status: 'error',
        duration: 5000,
      });
    }
  }, [retryCount, toast, sleep]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess, retryCount]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Read the file data as an ArrayBuffer
    const reader = new FileReader();
    
    reader.onload = async () => {
      try {
        const result = await window.electron.encryptAndStoreFile({
          data: reader.result,
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
      } catch (error) {
        toast({
          title: 'Fehler',
          description: 'Fehler beim Verarbeiten der Datei.',
          status: 'error',
          duration: 3000,
        });
      }
    };

    reader.onerror = () => {
      toast({
        title: 'Fehler',
        description: 'Fehler beim Lesen der Datei.',
        status: 'error',
        duration: 3000,
      });
    };

    reader.readAsArrayBuffer(file);
  };

  const handleFileClick = async (file) => {
    const result = await window.electron.openSecureFile(file.id);
    if (!result.success) {
      toast({
        title: 'Fehler',
        description: result.error || 'Fehler beim Öffnen der Datei.',
        status: 'error',
        duration: 3000,
      });
    }
  };

  const handleDeleteClick = (e, file) => {
    e.stopPropagation(); // Prevent row click
    setFileToDelete(file);
    onOpen();
  };

  const handleDelete = async () => {
    if (!fileToDelete) return;

    try {
      const result = await window.electron.deleteSecureFile(fileToDelete.id);
      if (result.success) {
        await loadFiles(); // Wait for files to reload
        toast({
          title: 'Erfolg',
          description: 'Datei wurde gelöscht.',
          status: 'success',
          duration: 3000,
        });
      } else {
        toast({
          title: 'Fehler',
          description: result.error || 'Fehler beim Löschen der Datei.',
          status: 'error',
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      toast({
        title: 'Fehler',
        description: 'Fehler beim Löschen der Datei.',
        status: 'error',
        duration: 3000,
      });
    } finally {
      setFileToDelete(null);
      onClose();
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
              <Th width="50px"></Th>
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
                <Td>
                  <IconButton
                    aria-label="Datei löschen"
                    icon={<DeleteIcon />}
                    size="sm"
                    colorScheme="red"
                    variant="ghost"
                    onClick={(e) => handleDeleteClick(e, file)}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </VStack>

      <AlertDialog
        isOpen={isOpen}
        leastDestructiveRef={cancelRef}
        onClose={onClose}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Datei löschen
            </AlertDialogHeader>

            <AlertDialogBody>
              Sind Sie sicher? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogBody>

            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={onClose}>
                Abbrechen
              </Button>
              <Button colorScheme="red" onClick={handleDelete} ml={3}>
                Löschen
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
}

export default SecureDocuments;
