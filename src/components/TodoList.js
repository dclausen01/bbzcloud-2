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
    if (!text.trim()) return;

    const newTodo = {
      id: Date.now(),
      text,
      completed: false,
      folder: selectedFolder,
      createdAt: new Date().toISOString(),
      reminder: null
    };

    setTodos(prev => [...prev, newTodo]);
    setInputValue('');
  }, [inputValue, selectedFolder]);

  // Handle initialText changes
  useEffect(() => {
    if (initialText) {
      handleAddTodo(initialText);
      onTextAdded();
    }
  }, [initialText, handleAddTodo, onTextAdded]);

  // Load todos and folders from electron-store on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedTodos = await window.electron.getTodos();
        const savedFolders = await window.electron.getTodoFolders();
        const savedSortType = await window.electron.getTodoSortType();
        setTodos(savedTodos);
        setFolders(savedFolders);
        setSortType(savedSortType);
      } catch (error) {
        console.error('Error loading todos:', error);
      }
    };
    loadData();
  }, []);

  // Save todos whenever they change
  useEffect(() => {
    window.electron.saveTodos(todos);
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
    if (!newFolderName.trim() || folders.includes(newFolderName)) return;
    setFolders(prev => [...prev, newFolderName]);
    setNewFolderName('');
  };

  const handleDeleteFolder = (folder) => {
    if (folder === 'Default') return;
    setFolders(prev => prev.filter(f => f !== folder));
    setTodos(prev => prev.filter(todo => todo.folder !== folder));
    if (selectedFolder === folder) {
      setSelectedFolder('Default');
    }
  };

  const handleToggleTodo = (id) => {
    setTodos(prev => prev.map(todo => 
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  const handleDeleteTodo = (id) => {
    setTodos(prev => prev.filter(todo => todo.id !== id));
  };

  const handleEditTodo = (todo) => {
    setEditingTodo(todo);
  };

  const handleUpdateTodo = (id, newText) => {
    setTodos(prev => prev.map(todo =>
      todo.id === id ? { ...todo, text: newText } : todo
    ));
    setEditingTodo(null);
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
              <MenuItem>
                <HStack>
                  <Input
                    placeholder="Neuer Ordnername"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    size="sm"
                  />
                  <IconButton
                    icon={<AddIcon />}
                    onClick={handleAddFolder}
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
        <Select value={sortType} onChange={(e) => setSortType(e.target.value)}>
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
