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
  const [todoState, setTodoState] = useState({
    todos: [],
    folders: ['Default'],
    sortType: 'manual',
    selectedFolder: 'Default'
  });
  const [inputValue, setInputValue] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [editingTodo, setEditingTodo] = useState(null);
  const toast = useToast();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Load todo state on mount and save on changes
  useEffect(() => {
    const loadData = async () => {
      try {
        const { todoState: savedState } = await window.electron.getTodoState();
        setTodoState(savedState);
      } catch (error) {
        console.error('Error loading todo state:', error);
        toast({
          title: 'Fehler beim Laden',
          description: `Fehler beim Laden der Todos: ${error.message}`,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    window.electron.saveTodoState(todoState);
  }, [todoState]);

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
  }, [inputValue, todoState.selectedFolder]);

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
    const confirmMessage = todosInFolder > 0
      ? `Möchten Sie den Ordner "${folder}" wirklich löschen? ${todosInFolder} Aufgabe${todosInFolder === 1 ? '' : 'n'} werden in den Standardordner verschoben.`
      : `Möchten Sie den leeren Ordner "${folder}" wirklich löschen?`;

    if (window.confirm(confirmMessage)) {
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
    }
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

  const handleDeleteTodo = (id) => {
    const todoToDelete = todoState.todos.find(todo => todo.id === id);
    if (!todoToDelete) return;

    const isCompleted = todoToDelete.completed;
    const confirmMessage = isCompleted 
      ? 'Möchten Sie diese erledigte Aufgabe wirklich löschen?'
      : 'Möchten Sie diese unerledigte Aufgabe wirklich löschen?';

    if (window.confirm(confirmMessage)) {
      setTodoState(prev => ({
        ...prev,
        todos: prev.todos.filter(todo => todo.id !== id)
      }));
      
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

  const onDragEnd = (result) => {
    if (!result.destination || todoState.sortType !== 'manual') return;

    const allTodos = [...todoState.todos];
    const currentFolderTodos = allTodos.filter(todo => todo.folder === todoState.selectedFolder);
    const otherTodos = allTodos.filter(todo => todo.folder !== todoState.selectedFolder);
    
    const [reorderedItem] = currentFolderTodos.splice(result.source.index, 1);
    currentFolderTodos.splice(result.destination.index, 0, reorderedItem);

    setTodoState(prev => ({
      ...prev,
      todos: [...otherTodos, ...currentFolderTodos]
    }));

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
            value={todoState.selectedFolder} 
            onChange={(e) => setTodoState(prev => ({ ...prev, selectedFolder: e.target.value }))}
            flex={1}
          >
            {todoState.folders.map(folder => (
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
                    isDragDisabled={todoState.sortType !== 'manual'}
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
                              {todoState.sortType === 'manual' && (
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
