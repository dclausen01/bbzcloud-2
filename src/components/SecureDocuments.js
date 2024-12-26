import React, { useState, useCallback, useEffect } from 'react';
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
  Input,
  InputGroup,
  InputRightElement,
} from '@chakra-ui/react';

const { ipcRenderer } = window.electron;

function SecureDocuments() {
  const [files, setFiles] = useState([]);
  const [password, setPassword] = useState('');
  const [isPasswordSet, setIsPasswordSet] = useState(false);
  const toast = useToast();
  const { colorMode } = useColorMode();

  useEffect(() => {
    loadFiles();
    checkPassword();
  }, []);

  const checkPassword = async () => {
    const result = await ipcRenderer.invoke('check-secure-store-password');
    setIsPasswordSet(result.exists);
  };

  const loadFiles = async () => {
    if (!isPasswordSet) return;
    const result = await ipcRenderer.invoke('list-secure-files');
    if (result.success) {
      setFiles(result.files);
    }
  };

  const handleSetPassword = async () => {
    if (password.length < 8) {
      toast({
        title: 'Fehler',
        description: 'Das Passwort muss mindestens 8 Zeichen lang sein.',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    const result = await ipcRenderer.invoke('set-secure-store-password', password);
    if (result.success) {
      setIsPasswordSet(true);
      toast({
        title: 'Erfolg',
        description: 'Passwort wurde gesetzt.',
        status: 'success',
        duration: 3000,
      });
    }
  };

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
        description: 'Fehler beim Speichern der Datei.',
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
        description: 'Fehler beim Öffnen der Datei.',
        status: 'error',
        duration: 3000,
      });
    }
  };

  if (!isPasswordSet) {
    return (
      <Box p={4}>
        <VStack spacing={4} align="stretch">
          <Text>Bitte setzen Sie ein Passwort für den sicheren Dokumentenspeicher:</Text>
          <InputGroup size="md">
            <Input
              pr="4.5rem"
              type="password"
              placeholder="Passwort eingeben"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <InputRightElement width="4.5rem">
              <Button h="1.75rem" size="sm" onClick={handleSetPassword}>
                Setzen
              </Button>
            </InputRightElement>
          </InputGroup>
        </VStack>
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
