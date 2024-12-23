import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon, EditIcon, TimeIcon, ChevronDownIcon, DragHandleIcon } from '@chakra-ui/icons';
import { DragDropContext, Droppable as DroppableBase, Draggable } from 'react-beautiful-dnd';
import ReactMarkdown from 'react-markdown';
import DatePicker from 'react-datepicker';
import { registerLocale } from 'react-datepicker';
import de from 'date-fns/locale/de';
import "react-datepicker/dist/react-datepicker.css";

registerLocale('de', de);

const StrictModeDroppable = ({ children, ...props }) => {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const animation = requestAnimationFrame(() => setEnabled(true));
    return () => {
      cancelAnimationFrame(animation);
      setEnabled(false);
    };
  }, []);
  if (!enabled) {
    return null;
  }
  return <DroppableBase {...props}>{children}</DroppableBase>;
};

const TodoList = ({ initialText, onTextAdded }) => {
  const [todos, setTodos] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [folders, setFolders] = useState(['Default']);
  const [selectedFolder, setSelectedFolder] = useState('Default');
  const [newFolderName, setNewFolderName] = useState('');
  const [editingTodo, setEditingTodo] = useState(null);
  const [sortType, setSortType] = useState('manual');
  const toast = useToast();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

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
      folder: selectedFolder,
      createdAt: new Date().toISOString(),
      reminder: null
    };

    setTodos(prev => [...prev, newTodo]);
    setInputValue('');

    toast({
      title: 'Aufgabe hinzugefügt',
      description: 'Die neue Aufgabe wurde erfolgreich hinzugefügt.',
      status: 'success',
      duration: 2000,
      isClosable: true,
    });
  }, [inputValue, selectedFolder]);

  // Handle initialText changes
  useEffect(() => {
    if (initialText) {
      handleAddTodo(initialText);
      onTextAdded();
    }
  }, [initialText, handleAddTodo, onTextAdded]);

  // Load folders first, then todos from electron-store on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load folders first
        const savedFolders = await window.electron.getTodoFolders();
        
        // Ensure Default folder always exists
        const folders = savedFolders.includes('Default') 
          ? savedFolders 
          : ['Default', ...savedFolders];
        setFolders(folders);
        
        // Load todos after folders are set
        const savedTodos = await window.electron.getTodos();
        
        // Filter out todos with non-existent folders and move them to Default
        const validTodos = savedTodos.map(todo => 
          folders.includes(todo.folder) ? todo : { ...todo, folder: 'Default' }
        );
        setTodos(validTodos);

        const savedSortType = await window.electron.getTodoSortType();
        setSortType(savedSortType);

        // Set selected folder to Default if current selection is invalid
        setSelectedFolder(prev => folders.includes(prev) ? prev : 'Default');
      } catch (error) {
        console.error('Error loading todos:', error);
        toast({
          title: 'Fehler beim Laden',
          description: `Fehler beim Laden der Todos: ${error.message}`,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        // Ensure Default folder exists even on error
        setFolders(['Default']);
        setSelectedFolder('Default');
      }
    };
    loadData();
  }, []); // Remove toast dependency as it's not needed

  // Save todos whenever they change
  useEffect(() => {
    // Validate todos before saving to prevent invalid data
    const validTodos = todos.map(todo => ({
      id: todo.id,
      text: todo.text || '',
      completed: Boolean(todo.completed),
      folder: todo.folder || 'Default',
      createdAt: todo.createdAt || new Date().toISOString(),
      reminder: todo.reminder || null
    }));
    window.electron.saveTodos(validTodos);
  }, [todos]);

  // Save folders whenever they change
  useEffect(() => {
    window.electron.saveTodoFolders(folders);
  }, [folders]);

  // Save sort type whenever it changes
  useEffect(() => {
    window.electron.saveTodoSortType(sortType);
  }, [sortType]);

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
    
    if (folders.includes(trimmedName)) {
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
    
    setFolders(prev => {
      // Find the index of Default folder
      const defaultIndex = prev.indexOf('Default');
      if (defaultIndex === -1) {
        // If Default doesn't exist, add it with the new folder
        return ['Default', folderToAdd];
      }
      // Insert new folder after Default
      const newFolders = [...prev];
      newFolders.splice(defaultIndex + 1, 0, folderToAdd);
      return newFolders;
    });
    
    // Switch to the newly created folder
    setSelectedFolder(folderToAdd);
    setNewFolderName('');
    
    toast({
      title: 'Ordner erstellt',
      description: `Ordner "${folderToAdd}" wurde erstellt`,
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

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

    // Count todos in this folder
    const todosInFolder = todos.filter(todo => todo.folder === folder).length;
    const confirmMessage = todosInFolder > 0
      ? `Möchten Sie den Ordner "${folder}" wirklich löschen? ${todosInFolder} Aufgabe${todosInFolder === 1 ? '' : 'n'} werden in den Standardordner verschoben.`
      : `Möchten Sie den leeren Ordner "${folder}" wirklich löschen?`;

    if (window.confirm(confirmMessage)) {
      // Move todos from deleted folder to Default folder
      setTodos(prev => prev.map(todo => 
        todo.folder === folder ? { ...todo, folder: 'Default' } : todo
      ));
      
      // Remove the folder
      setFolders(prev => prev.filter(f => f !== folder));
      
      // Switch to Default folder if the deleted folder was selected
      if (selectedFolder === folder) {
        setSelectedFolder('Default');
      }

      toast({
        title: 'Ordner gelöscht',
        description: todosInFolder > 0
          ? `Ordner "${folder}" wurde gelöscht. ${todosInFolder} Aufgabe${todosInFolder === 1 ? '' : 'n'} wurden in den Standardordner verschoben.`
          : `Ordner "${folder}" wurde gelöscht.`,
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleToggleTodo = (id) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    const newCompleted = !todo.completed;
    setTodos(prev => prev.map(t => 
      t.id === id ? { ...t, completed: newCompleted } : t
    ));

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

  const handleDeleteTodo = (id) => {
    const todoToDelete = todos.find(todo => todo.id === id);
    if (!todoToDelete) return;

    const isCompleted = todoToDelete.completed;
    const confirmMessage = isCompleted 
      ? 'Möchten Sie diese erledigte Aufgabe wirklich löschen?'
      : 'Möchten Sie diese unerledigte Aufgabe wirklich löschen?';

    if (window.confirm(confirmMessage)) {
      setTodos(prev => prev.filter(todo => todo.id !== id));
      
      toast({
        title: 'Aufgabe gelöscht',
        description: 'Die Aufgabe wurde erfolgreich gelöscht.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    }
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

    setTodos(prev => prev.map(todo =>
      todo.id === id ? { ...todo, text: trimmedText } : todo
    ));
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

    setTodos(prev => prev.map(t =>
      t.id === todo.id ? updatedTodo : t
    ));

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
    const filteredTodos = todos.filter(todo => todo.folder === selectedFolder);
    
    switch (sortType) {
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
  }, [todos, selectedFolder, sortType]);

  const onDragEnd = (result) => {
    if (!result.destination || sortType !== 'manual') return;

    const allTodos = [...todos];
    const currentFolderTodos = allTodos.filter(todo => todo.folder === selectedFolder);
    const otherTodos = allTodos.filter(todo => todo.folder !== selectedFolder);
    
    const [reorderedItem] = currentFolderTodos.splice(result.source.index, 1);
    currentFolderTodos.splice(result.destination.index, 0, reorderedItem);

    setTodos([...otherTodos, ...currentFolderTodos]);

    toast({
      title: 'Reihenfolge geändert',
      description: 'Die Aufgaben wurden erfolgreich neu angeordnet.',
      status: 'success',
      duration: 2000,
      isClosable: true,
    });
  };

  return (
    <Box>
      <VStack spacing={4} align="stretch">
        {/* Folder Management */}
        <HStack spacing={4}>
          <Select 
            value={selectedFolder} 
            onChange={(e) => setSelectedFolder(e.target.value)}
            flex={1}
          >
            {folders.map(folder => (
              <option key={folder} value={folder}>{folder === 'Default' ? 'Standard' : folder}</option>
            ))}
          </Select>
          <Menu>
            <MenuButton as={Button} rightIcon={<ChevronDownIcon />} minW="120px">
              Verwalten
            </MenuButton>
            <MenuList>
              <MenuItem closeOnSelect={false}>
                <HStack onClick={(e) => e.stopPropagation()}>
                  <Input
                    placeholder="Neuer Ordnername"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAddFolder();
                      }
                    }}
                    size="sm"
                  />
                  <IconButton
                    icon={<AddIcon />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddFolder();
                    }}
                    size="sm"
                    aria-label="Ordner hinzufügen"
                  />
                </HStack>
              </MenuItem>
              {folders.map(folder => (
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
          value={sortType} 
          onChange={(e) => {
            setSortType(e.target.value);
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
        <HStack>
          <Input
            placeholder="Neue Aufgabe hinzufügen..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddTodo()}
          />
          <IconButton
            icon={<AddIcon />}
            onClick={() => handleAddTodo()}
            aria-label="Aufgabe hinzufügen"
          />
        </HStack>

        {/* Todo List */}
        <DragDropContext onDragEnd={onDragEnd}>
          <StrictModeDroppable droppableId="todos">
            {(provided) => (
              <VStack
                spacing={2}
                align="stretch"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                {visibleTodos.map((todo, index) => (
                  <Draggable
                    key={todo.id}
                    draggableId={`todo-${todo.id}`}
                    index={index}
                    isDragDisabled={sortType !== 'manual'}
                  >
                    {(provided, snapshot) => (
                      <Box
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        p={2}
                        borderWidth="1px"
                        borderRadius="md"
                        borderColor={borderColor}
                        bg={bg}
                        boxShadow={snapshot.isDragging ? "lg" : "none"}
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
                              {sortType === 'manual' && (
                                <div {...provided.dragHandleProps}>
                                  <IconButton
                                    icon={<DragHandleIcon />}
                                    variant="ghost"
                                    size="sm"
                                    aria-label="Verschieben"
                                    cursor="grab"
                                    _active={{ cursor: "grabbing" }}
                                  />
                                </div>
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
                              <Popover>
                                <PopoverTrigger>
                                  <IconButton
                                    icon={<TimeIcon />}
                                    size="sm"
                                    aria-label="Erinnerung setzen"
                                  />
                                </PopoverTrigger>
                                <PopoverContent p={4}>
                                  <PopoverBody>
                                    <FormControl>
                                      <FormLabel>Erinnerung setzen</FormLabel>
                                      <DatePicker
                                        selected={todo.reminder ? new Date(todo.reminder) : null}
                                        onChange={(date) => handleSetReminder(todo, date)}
                                        showTimeSelect
                                        dateFormat="dd.MM.yyyy HH:mm"
                                        locale="de"
                                        timeFormat="HH:mm"
                                        timeIntervals={15}
                                        customInput={<Input />}
                                      />
                                    </FormControl>
                                  </PopoverBody>
                                </PopoverContent>
                              </Popover>
                              <IconButton
                                icon={<EditIcon />}
                                onClick={() => handleEditTodo(todo)}
                                size="sm"
                                aria-label="Bearbeiten"
                              />
                              <IconButton
                                icon={<DeleteIcon />}
                                onClick={() => handleDeleteTodo(todo.id)}
                                size="sm"
                                aria-label="Löschen"
                              />
                            </HStack>
                          </HStack>
                        )}
                      </Box>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </VStack>
            )}
          </StrictModeDroppable>
        </DragDropContext>
      </VStack>
    </Box>
  );
};

export default TodoList;
