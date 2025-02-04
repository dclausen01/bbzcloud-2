import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  VStack,
  HStack,
  Input,
  IconButton,
  useColorModeValue,
  Button,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useToast,
  Textarea,
  Checkbox,
  Badge,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  Select,
  FormControl,
  FormLabel,
  Spinner,
  Text,
  Center,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon, EditIcon, TimeIcon, ChevronDownIcon, DragHandleIcon } from '@chakra-ui/icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactMarkdown from 'react-markdown';
import DatePicker from 'react-datepicker';
import { registerLocale } from 'react-datepicker';
import de from 'date-fns/locale/de';
import "react-datepicker/dist/react-datepicker.css";
import { css } from '@emotion/react';

const datePickerStyles = css`
  .react-datepicker {
    font-family: inherit;
    border: 1px solid var(--chakra-colors-gray-200);
    border-radius: var(--chakra-radii-md);
    background-color: var(--chakra-colors-white);
  }
  .react-datepicker__header {
    background-color: var(--chakra-colors-gray-50);
    border-bottom: 1px solid var(--chakra-colors-gray-200);
    padding: 12px 8px 8px;
  }
  .react-datepicker__navigation {
    top: 12px;
  }
  .react-datepicker__navigation--previous {
    left: 7px;
  }
  .react-datepicker__navigation--next {
    right: 105px;
  }
  .react-datepicker__current-month {
    margin-bottom: 4px;
  }
  .react-datepicker {
    display: flex !important;
    flex-direction: row !important;
    font-size: 0.9rem !important;
  }
  .react-datepicker__month-container {
    float: none !important;
    width: 220px !important;
  }
  .react-datepicker__time-container {
    float: none !important;
    border-left: 1px solid var(--chakra-colors-gray-200);
    width: 85px !important;
  }
  .react-datepicker__time-list-item {
    height: auto !important;
    padding: 8px !important;
  }
  .react-datepicker__time-container .react-datepicker__time .react-datepicker__time-box {
    width: 85px !important;
    margin: 0 !important;
  }
  .react-datepicker__time-list {
    padding: 0 !important;
  }
  .react-datepicker__time {
    background-color: inherit !important;
  }
  .chakra-ui-dark .react-datepicker {
    background-color: var(--chakra-colors-gray-600);
    border-color: var(--chakra-colors-gray-500);
    color: var(--chakra-colors-gray-100);
  }
  .chakra-ui-dark .react-datepicker__header {
    background-color: var(--chakra-colors-gray-700);
    border-color: var(--chakra-colors-gray-500);
  }
  .react-datepicker__time-container {
    margin-left: 24px !important;
    border-color: var(--chakra-colors-gray-500);
  }
  .chakra-ui-dark {
    color: var(--chakra-colors-gray-100);
  }
  .chakra-ui-dark .react-datepicker__time-container,
  .chakra-ui-dark .react-datepicker__time,
  .chakra-ui-dark .react-datepicker__time-box,
  .chakra-ui-dark .react-datepicker__time-list {
    background-color: var(--chakra-colors-gray-600) !important;
  }
  .chakra-ui-dark .react-datepicker__header,
  .chakra-ui-dark .react-datepicker__current-month,
  .chakra-ui-dark .react-datepicker__day-name,
  .chakra-ui-dark .react-datepicker__day,
  .chakra-ui-dark .react-datepicker__time-name,
  .chakra-ui-dark .react-datepicker__time-container {
    color: var(--chakra-colors-gray-100) !important;
  }
  .chakra-ui-dark .react-datepicker__time-list-item,
  .chakra-ui-dark .react-datepicker__time-list-item:not(:hover) {
    color: var(--chakra-colors-gray-100) !important;
    background-color: var(--chakra-colors-gray-600) !important;
    padding: 8px 16px !important;
  }
  .chakra-ui-dark .react-datepicker__time-list-item:hover {
    background-color: var(--chakra-colors-gray-600) !important;
  }
  .chakra-ui-dark .react-datepicker__time-list-item--selected {
    background-color: var(--chakra-colors-blue-500) !important;
    color: white !important;
  }
  .chakra-ui-dark .react-datepicker__day {
    color: var(--chakra-colors-gray-100) !important;
  }
  .chakra-ui-dark .react-datepicker__day:hover {
    background-color: var(--chakra-colors-gray-600);
  }
  .chakra-ui-dark .react-datepicker__day--selected {
    background-color: var(--chakra-colors-blue-500);
    color: white;
  }
  .chakra-ui-dark .react-datepicker__day-name {
    color: var(--chakra-colors-gray-200);
  }
  .chakra-ui-dark .react-datepicker__current-month {
    color: var(--chakra-colors-gray-200);
  }
  .chakra-ui-dark .react-datepicker__input-container input {
    color: var(--chakra-colors-gray-200);
    background-color: var(--chakra-colors-gray-700);
  }
  .chakra-ui-dark .react-datepicker__navigation-icon::before {
    border-color: var(--chakra-colors-gray-200);
  }
  .chakra-ui-dark .react-datepicker__year-read-view--down-arrow,
  .chakra-ui-dark .react-datepicker__month-read-view--down-arrow {
    border-color: var(--chakra-colors-gray-200);
  }
`;

registerLocale('de', de);

// Sortable todo item component
const SortableItem = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: String(id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
};

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, isCompleted }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Aufgabe löschen</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {isCompleted 
            ? 'Möchten Sie diese erledigte Aufgabe wirklich löschen?'
            : 'Möchten Sie diese unerledigte Aufgabe wirklich löschen?'}
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="red" mr={3} onClick={onConfirm}>
            Löschen
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const DeleteFolderModal = ({ isOpen, onClose, onConfirm, folderName, todoCount }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Ordner löschen</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {todoCount > 0 
            ? `Möchten Sie den Ordner "${folderName}" wirklich löschen? ${todoCount} Aufgabe${todoCount === 1 ? '' : 'n'} werden in den Standardordner verschoben.`
            : `Möchten Sie den leeren Ordner "${folderName}" wirklich löschen?`}
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="red" mr={3} onClick={onConfirm}>
            Löschen
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const TodoList = ({ initialText, onTextAdded, isVisible, onReminderCountChange }) => {
  const [todoState, setTodoState] = useState({
    todos: [],
    folders: ['Default'],
    sortType: 'manual',
    selectedFolder: 'Default'
  });
  const [inputValue, setInputValue] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [editingTodo, setEditingTodo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const toast = useToast();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Load todo state when component becomes visible
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await window.electron.getTodoState();
        if (!result.success) {
          throw new Error(result.error);
        }
        setTodoState(result.todoState);
      } catch (error) {
        console.error('Error loading todo state:', error);
        setError(error.message);
        toast({
          title: 'Fehler beim Laden',
          description: `Fehler beim Laden der Todos: ${error.message}`,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      } finally {
        setIsLoading(false);
      }
    };
    if (isVisible) {
      loadData();
    }
  }, [toast, isVisible]);

  // Save todo state on changes with debounce
  useEffect(() => {
    const saveTodos = async () => {
      try {
        const result = await window.electron.saveTodoState(todoState);
        if (!result.success) {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error('Error saving todo state:', error);
        toast({
          title: 'Fehler beim Speichern',
          description: `Fehler beim Speichern der Todos: ${error.message}`,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    };
    
    if (!isLoading) {
      // Add debounce to prevent rapid saves
      const timeoutId = setTimeout(saveTodos, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [todoState, isLoading, toast]);

  // Calculate and notify parent of active reminders count
  useEffect(() => {
    if (!isLoading) {
      const now = new Date().getTime();
      const activeReminders = todoState.todos.filter(todo => 
        todo.reminder && new Date(todo.reminder).getTime() > now
      ).length;
      onReminderCountChange?.(activeReminders);
    }
  }, [todoState.todos, isLoading, onReminderCountChange]);

  const handleAddTodo = useCallback((text = inputValue) => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      toast({
        title: 'Fehler',
        description: 'Bitte geben Sie einen Text für die Aufgabe ein.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const newTodo = {
      id: Date.now(),
      text: trimmedText,
      completed: false,
      folder: todoState.selectedFolder,
      createdAt: new Date().toISOString(),
      reminder: null
    };

    setTodoState(prev => ({
      ...prev,
      todos: [...prev.todos, newTodo]
    }));
    setInputValue('');

    toast({
      title: 'Aufgabe hinzugefügt',
      description: 'Die neue Aufgabe wurde erfolgreich hinzugefügt.',
      status: 'success',
      duration: 2000,
      isClosable: true,
    });
  }, [inputValue, todoState.selectedFolder, toast]);

  // Handle initialText changes
  useEffect(() => {
    if (initialText) {
      handleAddTodo(initialText);
      onTextAdded();
    }
  }, [initialText, handleAddTodo, onTextAdded]);

  const handleAddFolder = () => {
    const trimmedName = newFolderName.trim();
    
    // Validation checks
    if (!trimmedName) {
      toast({
        title: 'Fehler',
        description: 'Bitte geben Sie einen Ordnernamen ein.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    if (todoState.folders.includes(trimmedName)) {
      toast({
        title: 'Fehler',
        description: 'Ein Ordner mit diesem Namen existiert bereits.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    // Check length
    if (trimmedName.length > 30) {
      toast({
        title: 'Fehler',
        description: 'Der Ordnername darf maximal 30 Zeichen lang sein.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    // Check for invalid characters
    if (!/^[a-zA-Z0-9\u00C0-\u017F\s-]+$/.test(trimmedName)) {
      toast({
        title: 'Fehler',
        description: 'Der Ordnername darf nur Buchstaben, Zahlen, Leerzeichen und Bindestriche enthalten.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    const folderToAdd = trimmedName;
    
    setTodoState(prev => {
      const defaultIndex = prev.folders.indexOf('Default');
      const newFolders = defaultIndex === -1 
        ? ['Default', folderToAdd]
        : [...prev.folders.slice(0, defaultIndex + 1), folderToAdd, ...prev.folders.slice(defaultIndex + 1)];
      
      return {
        ...prev,
        folders: newFolders,
        selectedFolder: folderToAdd
      };
    });
    
    setNewFolderName('');
    
    toast({
      title: 'Ordner erstellt',
      description: `Ordner "${folderToAdd}" wurde erstellt`,
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  const [deleteFolderModal, setDeleteFolderModal] = useState({
    isOpen: false,
    folderName: null,
    todoCount: 0
  });

  const handleDeleteFolder = (folder) => {
    if (folder === 'Default') {
      toast({
        title: 'Aktion nicht möglich',
        description: 'Der Standardordner kann nicht gelöscht werden.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const todosInFolder = todoState.todos.filter(todo => todo.folder === folder).length;
    setDeleteFolderModal({
      isOpen: true,
      folderName: folder,
      todoCount: todosInFolder
    });
  };

  const handleConfirmFolderDelete = () => {
    const folder = deleteFolderModal.folderName;
    const todosInFolder = deleteFolderModal.todoCount;

    setTodoState(prev => ({
      ...prev,
      todos: prev.todos.map(todo => 
        todo.folder === folder ? { ...todo, folder: 'Default' } : todo
      ),
      folders: prev.folders.filter(f => f !== folder),
      selectedFolder: prev.selectedFolder === folder ? 'Default' : prev.selectedFolder
    }));

    toast({
      title: 'Ordner gelöscht',
      description: todosInFolder > 0
        ? `Ordner "${folder}" wurde gelöscht. ${todosInFolder} Aufgabe${todosInFolder === 1 ? '' : 'n'} wurden in den Standardordner verschoben.`
        : `Ordner "${folder}" wurde gelöscht.`,
      status: 'info',
      duration: 3000,
      isClosable: true,
    });

    setDeleteFolderModal({
      isOpen: false,
      folderName: null,
      todoCount: 0
    });
  };

  const handleCancelFolderDelete = () => {
    setDeleteFolderModal({
      isOpen: false,
      folderName: null,
      todoCount: 0
    });
  };

  const handleToggleTodo = (id) => {
    const todo = todoState.todos.find(t => t.id === id);
    if (!todo) return;

    const newCompleted = !todo.completed;
    setTodoState(prev => ({
      ...prev,
      todos: prev.todos.map(t => 
        t.id === id ? { ...t, completed: newCompleted } : t
      )
    }));

    toast({
      title: newCompleted ? 'Aufgabe erledigt' : 'Aufgabe wieder offen',
      description: newCompleted 
        ? 'Die Aufgabe wurde als erledigt markiert.'
        : 'Die Aufgabe wurde als nicht erledigt markiert.',
      status: 'success',
      duration: 2000,
      isClosable: true,
    });
  };

  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    todoId: null,
    isCompleted: false
  });

  const handleDeleteTodo = (id) => {
    const todoToDelete = todoState.todos.find(todo => todo.id === id);
    if (!todoToDelete) return;

    setDeleteModal({
      isOpen: true,
      todoId: id,
      isCompleted: todoToDelete.completed
    });
  };

  const handleConfirmDelete = () => {
    setTodoState(prev => ({
      ...prev,
      todos: prev.todos.filter(todo => todo.id !== deleteModal.todoId)
    }));
    
    toast({
      title: 'Aufgabe gelöscht',
      description: 'Die Aufgabe wurde erfolgreich gelöscht.',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });

    setDeleteModal(prev => ({ ...prev, isOpen: false }));

    // Re-focus the input field after deletion
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const handleCancelDelete = () => {
    setDeleteModal({
      isOpen: false,
      todoId: null,
      isCompleted: false
    });
  };

  const handleEditTodo = (todo) => {
    setEditingTodo(todo);
  };

  const handleUpdateTodo = (id, newText) => {
    const trimmedText = newText.trim();
    if (!trimmedText) {
      toast({
        title: 'Fehler',
        description: 'Der Text der Aufgabe darf nicht leer sein.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setTodoState(prev => ({
      ...prev,
      todos: prev.todos.map(todo =>
        todo.id === id ? { ...todo, text: trimmedText } : todo
      )
    }));
    setEditingTodo(null);

    toast({
      title: 'Aufgabe bearbeitet',
      description: 'Die Änderungen wurden erfolgreich gespeichert.',
      status: 'success',
      duration: 2000,
      isClosable: true,
    });
  };

  const handleSetReminder = async (todo, date) => {
    if (!date) return;

    const updatedTodo = {
      ...todo,
      reminder: date.toISOString()
    };

    setTodoState(prev => ({
      ...prev,
      todos: prev.todos.map(t =>
        t.id === todo.id ? updatedTodo : t
      )
    }));

    // Schedule notification
    await window.electron.scheduleNotification({
      title: 'Aufgaben-Erinnerung',
      body: todo.text,
      when: date.getTime()
    });

    toast({
      title: 'Erinnerung gesetzt',
      description: `Erinnerung gesetzt für ${date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`,
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  const visibleTodos = useMemo(() => {
    const filteredTodos = todoState.todos.filter(todo => todo.folder === todoState.selectedFolder);
    
    switch (todoState.sortType) {
      case 'date':
        return [...filteredTodos].sort((a, b) => 
          new Date(b.createdAt) - new Date(a.createdAt)
        );
      case 'completed':
        return [...filteredTodos].sort((a, b) => 
          Number(a.completed) - Number(b.completed)
        );
      default:
        return filteredTodos;
    }
  }, [todoState]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (!over || todoState.sortType !== 'manual') return;

    if (active.id !== over.id) {
      const allTodos = [...todoState.todos];
      const currentFolderTodos = allTodos.filter(todo => todo.folder === todoState.selectedFolder);
      const otherTodos = allTodos.filter(todo => todo.folder !== todoState.selectedFolder);
      
      const oldIndex = currentFolderTodos.findIndex(todo => String(todo.id) === active.id);
      const newIndex = currentFolderTodos.findIndex(todo => String(todo.id) === over.id);
      
      const newCurrentFolderTodos = arrayMove(currentFolderTodos, oldIndex, newIndex);

      setTodoState(prev => ({
        ...prev,
        todos: [...otherTodos, ...newCurrentFolderTodos]
      }));

      toast({
        title: 'Reihenfolge geändert',
        description: 'Die Aufgaben wurden erfolgreich neu angeordnet.',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    }
  };

  if (isLoading) {
    return (
      <Center p={8}>
        <VStack spacing={4}>
          <Spinner size="xl" />
          <Text>Lade Todos...</Text>
        </VStack>
      </Center>
    );
  }

  if (error) {
    return (
      <Center p={8}>
        <VStack spacing={4}>
          <Text color="red.500">Fehler beim Laden der Todos:</Text>
          <Text>{error}</Text>
          <Button
            onClick={() => window.location.reload()}
            colorScheme="blue"
          >
            Neu laden
          </Button>
        </VStack>
      </Center>
    );
  }

  return (
    <Box maxW="800px" mx="auto">
      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        isCompleted={deleteModal.isCompleted}
      />
      <DeleteFolderModal
        isOpen={deleteFolderModal.isOpen}
        onClose={handleCancelFolderDelete}
        onConfirm={handleConfirmFolderDelete}
        folderName={deleteFolderModal.folderName}
        todoCount={deleteFolderModal.todoCount}
      />
      <VStack spacing={4} align="stretch">
        {/* Folder Management */}
        <HStack spacing={4}>
          <Select 
            value={todoState.selectedFolder} 
            onChange={(e) => setTodoState(prev => ({ ...prev, selectedFolder: e.target.value }))}
            flex={1}
          >
            {todoState.folders.map(folder => (
              <option key={folder} value={folder}>{folder === 'Default' ? 'Standard' : folder}</option>
            ))}
          </Select>
          <Menu closeOnSelect={false}>
            <MenuButton as={Button} rightIcon={<ChevronDownIcon />} minW="120px">
              Verwalten
            </MenuButton>
            <MenuList>
              <MenuItem>
                <HStack onClick={(e) => e.stopPropagation()}>
                  <Input
                    placeholder="Neuer Ordnername"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddFolder();
                      }
                    }}
                    size="sm"
                  />
                  <IconButton
                    icon={<AddIcon />}
                    onClick={() => handleAddFolder()}
                    size="sm"
                    aria-label="Ordner hinzufügen"
                  />
                </HStack>
              </MenuItem>
              {todoState.folders.map(folder => (
                <MenuItem key={folder}>
                  <HStack justify="space-between" width="100%">
                    <span>{folder === 'Default' ? 'Standard' : folder}</span>
                    {folder !== 'Default' && (
                      <IconButton
                        icon={<DeleteIcon />}
                        onClick={() => handleDeleteFolder(folder)}
                        size="sm"
                        aria-label="Ordner löschen"
                      />
                    )}
                  </HStack>
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
        </HStack>

        {/* Sort Type Selection */}
        <Select 
          value={todoState.sortType} 
          onChange={(e) => {
            setTodoState(prev => ({ ...prev, sortType: e.target.value }));
            toast({
              title: 'Sortierung geändert',
              description: `Die Aufgaben werden jetzt ${
                e.target.value === 'manual' ? 'manuell' :
                e.target.value === 'date' ? 'nach Datum' :
                'nach Status'
              } sortiert.`,
              status: 'info',
              duration: 2000,
              isClosable: true,
            });
          }}
        >
          <option value="manual">Manuelle Sortierung</option>
          <option value="date">Sortierung nach Datum</option>
          <option value="completed">Sortierung nach offen/abgeschlossen</option>
        </Select>

        {/* Add Todo Input */}
        <HStack spacing={4}>
          <Input
            placeholder="Neue Aufgabe hinzufügen..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleAddTodo();
              }
            }}
            ref={inputRef}
            autoFocus
          />
          <IconButton
            icon={<AddIcon />}
            onClick={() => handleAddTodo()}
            aria-label="Aufgabe hinzufügen"
          />
        </HStack>

        {/* Todo List */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={visibleTodos.map(todo => String(todo.id))}
            strategy={verticalListSortingStrategy}
          >
            <VStack spacing={2} align="stretch">
              {visibleTodos.map((todo) => (
                <SortableItem key={todo.id} id={todo.id}>
                  <Box
                    p={2}
                    borderWidth="1px"
                    borderRadius="md"
                    borderColor={borderColor}
                    bg={bg}
                  >
                    {editingTodo?.id === todo.id ? (
                      <Textarea
                        value={editingTodo.text}
                        onChange={(e) => setEditingTodo({ ...editingTodo, text: e.target.value })}
                        onBlur={() => handleUpdateTodo(todo.id, editingTodo.text)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleUpdateTodo(todo.id, editingTodo.text);
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <HStack justify="space-between" align="center" width="100%" spacing={4}>
                        <HStack align="start" flex={1} spacing={3}>
                          {todoState.sortType === 'manual' && (
                            <IconButton
                              icon={<DragHandleIcon />}
                              variant="ghost"
                              size="sm"
                              aria-label="Verschieben"
                              cursor="grab"
                              _active={{ cursor: "grabbing" }}
                            />
                          )}
                          <Checkbox
                            isChecked={todo.completed}
                            onChange={() => handleToggleTodo(todo.id)}
                            mt={1}
                          />
                          <Box wordBreak="break-word" maxW="100%">
                            <ReactMarkdown>{todo.text}</ReactMarkdown>
                            {todo.reminder && (
                              <Badge colorScheme="purple" mt={1}>
                                Erinnerung: {new Date(todo.reminder).toLocaleString('de-DE', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </Badge>
                            )}
                          </Box>
                        </HStack>
                        <HStack spacing={2}>
                          <Menu>
                            <MenuButton
                              as={IconButton}
                              icon={<ChevronDownIcon />}
                              size="xs"
                              aria-label="Ordner wechseln"
                            />
                            <MenuList>
                              {todoState.folders.map(targetFolder => (
                                <MenuItem
                                  key={targetFolder}
                                  onClick={() => {
                                    if (targetFolder !== todo.folder) {
                                      setTodoState(prev => ({
                                        ...prev,
                                        todos: prev.todos.map(t =>
                                          t.id === todo.id ? { ...t, folder: targetFolder } : t
                                        )
                                      }));
                                      toast({
                                        title: 'Aufgabe verschoben',
                                        description: `Aufgabe wurde in den Ordner "${targetFolder === 'Default' ? 'Standard' : targetFolder}" verschoben.`,
                                        status: 'success',
                                        duration: 3000,
                                        isClosable: true,
                                      });
                                    }
                                  }}
                                  isDisabled={targetFolder === todo.folder}
                                >
                                  {targetFolder === 'Default' ? 'Standard' : targetFolder}
                                </MenuItem>
                              ))}
                            </MenuList>
                          </Menu>
                          <Popover>
                            <PopoverTrigger>
                              <IconButton
                                icon={<TimeIcon />}
                                size="xs"
                                aria-label="Erinnerung setzen"
                              />
                            </PopoverTrigger>
                            <PopoverContent p={4} width="360px" position="relative" right="45px">
                              <PopoverBody>
                                <FormControl>
                                  <FormLabel>Erinnerung setzen</FormLabel>
                                  <Box css={datePickerStyles}>
                                    <HStack spacing={2}>
                                      <Box flex="1">
                                        <DatePicker
                                          selected={todo.reminder ? new Date(todo.reminder) : null}
                                          onChange={(date) => handleSetReminder(todo, date)}
                                          showTimeSelect
                                          dateFormat="dd.MM.yyyy HH:mm"
                                          locale="de"
                                          timeFormat="HH:mm"
                                          timeIntervals={15}
                                          customInput={<Input />}
                                          popperModifiers={[
                                            {
                                              name: "offset",
                                              options: {
                                                offset: [-60, 10]
                                              }
                                            },
                                            {
                                              name: "preventOverflow",
                                              options: {
                                                padding: 16
                                              }
                                            }
                                          ]}
                                          popperPlacement="bottom-end"
                                          inline
                                          timeCaption="Zeit"
                                          shouldCloseOnSelect={false}
                                          calendarClassName="side-by-side-calendar"
                                        />
                                      </Box>
                                    </HStack>
                                  </Box>
                                </FormControl>
                              </PopoverBody>
                            </PopoverContent>
                          </Popover>
                          <IconButton
                            icon={<EditIcon />}
                            onClick={() => handleEditTodo(todo)}
                            size="xs"
                            aria-label="Bearbeiten"
                          />
                          <IconButton
                            icon={<DeleteIcon />}
                            onClick={() => handleDeleteTodo(todo.id)}
                            size="xs"
                            aria-label="Löschen"
                          />
                        </HStack>
                      </HStack>
                    )}
                  </Box>
                </SortableItem>
              ))}
            </VStack>
          </SortableContext>
        </DndContext>
      </VStack>
    </Box>
  );
};

export default TodoList;
