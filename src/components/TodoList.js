import React, { useState, useEffect, useMemo } from 'react';
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
import {
  Box,
  VStack,
  HStack,
  Input,
  Button,
  Text,
  IconButton,
  useToast,
  Checkbox,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Divider,
  Select,
  useColorMode,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  ButtonGroup,
} from '@chakra-ui/react';
import MDEditor from '@uiw/react-md-editor';
import { v4 as uuidv4 } from 'uuid';

// Sortable todo item component
const SortableTodoItem = ({ todo, onToggle, onDelete, onSetReminder }) => {
  const { colorMode } = useColorMode();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

  return (
    <HStack
      ref={setNodeRef}
      p={3}
      bg={colorMode === 'light' ? 'gray.50' : 'gray.700'}
      _hover={{ bg: colorMode === 'light' ? 'gray.100' : 'gray.600' }}
      borderRadius="md"
      spacing={3}
      style={{ transition }}
    >
      {/* Drag handle */}
      <Box
        {...attributes}
        {...listeners}
        cursor="grab"
        opacity={isDragging ? 0.5 : 1}
        style={{ transform: CSS.Transform.toString(transform) }}
        p={1}
        color={colorMode === 'light' ? 'gray.400' : 'gray.500'}
        _hover={{ color: colorMode === 'light' ? 'gray.600' : 'gray.300' }}
      >
        ⋮⋮
      </Box>
      <Checkbox
        size="sm"
        isChecked={todo.completed}
        onChange={() => onToggle(todo.id)}
        zIndex={1}
      />
      <Box 
        flex={1} 
        fontSize="sm"
        className={colorMode === 'dark' ? 'wmde-markdown-dark' : 'wmde-markdown'}
        data-color-mode={colorMode}
        zIndex={1}
      >
        <MDEditor.Markdown source={todo.text} />
      </Box>
      <Popover>
        <PopoverTrigger>
          <IconButton
            size="sm"
            icon={<span>⏰</span>}
            variant="ghost"
            aria-label="Erinnerung setzen"
            zIndex={1}
          />
        </PopoverTrigger>
        <PopoverContent p={2} w="auto">
          <PopoverBody>
            <Input
              size="sm"
              type="datetime-local"
              onChange={(e) => {
                const date = new Date(e.target.value);
                if (!isNaN(date.getTime())) {
                  onSetReminder(todo.id, date);
                }
              }}
            />
          </PopoverBody>
        </PopoverContent>
      </Popover>
      <IconButton
        size="sm"
        icon={<span>🗑️</span>}
        variant="ghost"
        onClick={() => onDelete(todo.id)}
        aria-label="Aufgabe löschen"
        zIndex={1}
      />
    </HStack>
  );
};

const TodoList = ({ initialTodoText = '', onTodoAdded }) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { colorMode } = useColorMode();
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState('');
  const [folders, setFolders] = useState(['Default']);
  const [currentFolder, setCurrentFolder] = useState('Default');
  const [newFolder, setNewFolder] = useState('');
  const [sortType, setSortType] = useState('manual'); // 'manual' or 'dueDate'
  const toast = useToast();

  // Handle initial todo text from context menu
  useEffect(() => {
    if (initialTodoText) {
      const todo = {
        id: uuidv4(),
        text: initialTodoText,
        completed: false,
        folder: currentFolder,
        reminder: null,
        createdAt: new Date().toISOString(),
        order: todos.length, // Add order for manual sorting
      };
      setTodos(prev => [...prev, todo]);
      onTodoAdded?.();
    }
  }, [initialTodoText, currentFolder, onTodoAdded, todos.length]);

  // Load todos and preferences from local storage
  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedTodos, savedFolders, savedSortType] = await Promise.all([
          window.electron.getTodos(),
          window.electron.getTodoFolders(),
          window.electron.getTodoSortType(),
        ]);

        if (savedTodos) {
          // Ensure all todos have an order property
          const todosWithOrder = savedTodos.map((todo, index) => ({
            ...todo,
            order: todo.order ?? index,
          }));
          setTodos(todosWithOrder);
        }
        
        if (savedFolders?.length > 0) {
          setFolders(savedFolders);
        }

        if (savedSortType) {
          setSortType(savedSortType);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };
    loadData();
  }, []);

  // Save todos to local storage whenever they change
  useEffect(() => {
    const saveTodos = async () => {
      try {
        await window.electron.saveTodos(todos);
      } catch (error) {
        console.error('Error saving todos:', error);
      }
    };
    saveTodos();
  }, [todos]);

  // Save folders to local storage whenever they change
  useEffect(() => {
    const saveFolders = async () => {
      try {
        await window.electron.saveTodoFolders(folders);
      } catch (error) {
        console.error('Error saving folders:', error);
      }
    };
    saveFolders();
  }, [folders]);

  // Save sort type whenever it changes
  useEffect(() => {
    const saveSortType = async () => {
      try {
        await window.electron.saveTodoSortType(sortType);
      } catch (error) {
        console.error('Error saving sort type:', error);
      }
    };
    saveSortType();
  }, [sortType]);

  const addTodo = () => {
    if (!newTodo.trim()) return;

    const todo = {
      id: uuidv4(),
      text: newTodo,
      completed: false,
      folder: currentFolder,
      reminder: null,
      createdAt: new Date().toISOString(),
      order: todos.length,
    };

    setTodos([...todos, todo]);
    setNewTodo('');
  };

  const addFolder = () => {
    if (!newFolder.trim() || folders.includes(newFolder)) return;
    setFolders([...folders, newFolder]);
    setNewFolder('');
  };

  const setDateTimeReminder = async (id, date) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    const reminderTime = date.getTime();
    const updatedTodo = { ...todo, reminder: date.toISOString() };

    setTodos(todos.map((t) => (t.id === id ? updatedTodo : t)));

    try {
      await window.electron.scheduleNotification({
        title: 'Todo Erinnerung',
        body: todo.text,
        when: reminderTime,
      });

      toast({
        title: 'Erinnerung gesetzt',
        description: `Erinnerung gesetzt für ${date.toLocaleString('de-DE')}`,
        status: 'success',
        duration: 3000,
      });
    } catch (error) {
      console.error('Error scheduling notification:', error);
      toast({
        title: 'Fehler',
        description: 'Erinnerung konnte nicht gesetzt werden',
        status: 'error',
        duration: 3000,
      });
    }
  };

  const toggleTodo = (id) => {
    setTodos(
      todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  };

  const deleteTodo = (id) => {
    setTodos(todos.filter((todo) => todo.id !== id));
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setTodos((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const reorderedItems = arrayMove(items, oldIndex, newIndex).map(
          (item, index) => ({ ...item, order: index })
        );

        return reorderedItems;
      });
    }
  };

  // Sort todos based on current sort type and filter by folder
  const sortedTodos = useMemo(() => {
    const folderTodos = todos.filter((todo) => todo.folder === currentFolder);

    if (sortType === 'dueDate') {
      return [...folderTodos].sort((a, b) => {
        // Put todos without reminders at the end
        if (!a.reminder && !b.reminder) return 0;
        if (!a.reminder) return 1;
        if (!b.reminder) return -1;
        return new Date(a.reminder) - new Date(b.reminder);
      });
    }

    // Manual sorting based on order property
    return [...folderTodos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [todos, currentFolder, sortType]);

  return (
    <Box p={4}>
      <VStack spacing={3} align="stretch">
        {/* Folder Selection and New Folder Input */}
        <HStack spacing={2}>
          <Select
            size="sm"
            value={currentFolder}
            onChange={(e) => setCurrentFolder(e.target.value)}
          >
            {folders.map((folder) => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
          </Select>
          <Input
            size="sm"
            placeholder="Neuer Ordner"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addFolder()}
          />
          <IconButton
            size="sm"
            icon={<span>➕</span>}
            onClick={addFolder}
            aria-label="Ordner hinzufügen"
          />
        </HStack>

        {/* New Todo Input */}
        <HStack spacing={2}>
          <Input
            size="sm"
            placeholder="Neue Aufgabe hinzufügen"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addTodo()}
          />
          <IconButton
            size="sm"
            icon={<span>➕</span>}
            onClick={addTodo}
            aria-label="Aufgabe hinzufügen"
          />
        </HStack>

        {/* Sort Type Selection */}
        <ButtonGroup size="sm" isAttached variant="outline">
          <Button
            size="sm"
            isActive={sortType === 'manual'}
            onClick={() => setSortType('manual')}
          >
            Manuelle Sortierung
          </Button>
          <Button
            size="sm"
            isActive={sortType === 'dueDate'}
            onClick={() => setSortType('dueDate')}
          >
            Nach Fälligkeit
          </Button>
        </ButtonGroup>

        {/* Todo List */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedTodos.map(todo => todo.id)}
            strategy={verticalListSortingStrategy}
          >
            <VStack align="stretch" spacing={2}>
              {sortedTodos.map((todo) => (
                <SortableTodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={toggleTodo}
                  onDelete={deleteTodo}
                  onSetReminder={setDateTimeReminder}
                />
              ))}
            </VStack>
          </SortableContext>
        </DndContext>
      </VStack>
    </Box>
  );
};

export default TodoList;
