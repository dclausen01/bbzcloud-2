import { extendTheme } from '@chakra-ui/react';

const config = {
  initialColorMode: 'light',
  useSystemColorMode: false,
  cssVarPrefix: 'bbz',
  // Enable color mode storage in localStorage
  storageKey: 'bbz-color-mode'
};

const colors = {
  brand: {
    50: '#e3f2fd',
    100: '#bbdefb',
    200: '#90caf9',
    300: '#64b5f6',
    400: '#42a5f5',
    500: '#2196f3',
    600: '#1e88e5',
    700: '#1976d2',
    800: '#1565c0',
    900: '#0d47a1',
  },
  schulcloud: {
    50: '#fff3e0',
    100: '#ffe0b2',
    200: '#ffcc80',
    300: '#ffb74d',
    400: '#ffa726',
    500: '#ff9800',
    600: '#fb8c00',
    700: '#f57c00',
    800: '#ef6c00',
    900: '#e65100',
  },
  moodle: {
    50: '#fbe9e7',
    100: '#ffccbc',
    200: '#ffab91',
    300: '#ff8a65',
    400: '#ff7043',
    500: '#ff5722',
    600: '#f4511e',
    700: '#e64a19',
    800: '#d84315',
    900: '#bf360c',
  },
  bbb: {
    50: '#e8eaf6',
    100: '#c5cae9',
    200: '#9fa8da',
    300: '#7986cb',
    400: '#5c6bc0',
    500: '#3f51b5',
    600: '#3949ab',
    700: '#303f9f',
    800: '#283593',
    900: '#1a237e',
  },
  wiki: {
    50: '#e1f5fe',
    100: '#b3e5fc',
    200: '#81d4fa',
    300: '#4fc3f7',
    400: '#29b6f6',
    500: '#03a9f4',
    600: '#039be5',
    700: '#0288d1',
    800: '#0277bd',
    900: '#01579b',
  },
  handbook: {
    50: '#e8f5e9',
    100: '#c8e6c9',
    200: '#a5d6a7',
    300: '#81c784',
    400: '#66bb6a',
    500: '#4caf50',
    600: '#43a047',
    700: '#388e3c',
    800: '#2e7d32',
    900: '#1b5e20',
  },
  taskcards: {
    50: '#e0f7fa',
    100: '#b2ebf2',
    200: '#80deea',
    300: '#4dd0e1',
    400: '#26c6da',
    500: '#00bcd4',
    600: '#00acc1',
    700: '#0097a7',
    800: '#00838f',
    900: '#006064',
  },
  cryptpad: {
    50: '#e0f4f5',
    100: '#b3e0e5',
    200: '#80ccd3',
    300: '#4db7c1',
    400: '#26a7b3',
    500: '#0097a4',
    600: '#008a9c',
    700: '#007891',
    800: '#006787',
    900: '#004a74',
  },
  lilac: {
    50: '#f3e5f5',
    100: '#e1bee7',
    200: '#ce93d8',
    300: '#ba68c8',
    400: '#ab47bc',
    500: '#9c27b0',
    600: '#8e24aa',
    700: '#7b1fa2',
    800: '#6a1b9a',
    900: '#4a148c',
  },
  blue: {
    50: '#e3f2fd',
    100: '#bbdefb',
    200: '#90caf9',
    300: '#64b5f6',
    400: '#42a5f5',
    500: '#2196f3',
    600: '#1e88e5',
    700: '#1976d2',
    800: '#1565c0',
    900: '#0d47a1',
  },
  orange: {
    50: '#fff3e0',
    100: '#ffe0b2',
    200: '#ffcc80',
    300: '#ffb74d',
    400: '#ffa726',
    500: '#ff9800',
    600: '#fb8c00',
    700: '#f57c00',
    800: '#ef6c00',
    900: '#e65100',
  },
  darkred: {
    50: '#ffebee',
    100: '#ffcdd2',
    200: '#ef9a9a',
    300: '#e57373',
    400: '#ef5350',
    500: '#b71c1c',
    600: '#c62828',
    700: '#d32f2f',
    800: '#c62828',
    900: '#b71c1c',
  }
};

const components = {
  Button: {
    baseStyle: {
      fontWeight: 'normal',
      borderRadius: 'md',
    },
    sizes: {
      sm: {
        h: '28px',
        fontSize: 'xs',
        px: 2,
      }
    },
    variants: {
      solid: (props) => ({
        bg: props.colorMode === 'dark' ? 'brand.600' : 'brand.500',
        color: 'white',
        _hover: {
          bg: props.colorMode === 'dark' ? 'brand.700' : 'brand.600',
        },
      }),
      schulcloud: (props) => ({
        bg: props.colorMode === 'dark' ? 'schulcloud.600' : 'schulcloud.500',
        color: 'white',
        _hover: {
          bg: props.colorMode === 'dark' ? 'schulcloud.700' : 'schulcloud.600',
        },
      }),
      moodle: (props) => ({
        bg: props.colorMode === 'dark' ? 'moodle.600' : 'moodle.500',
        color: 'white',
        _hover: {
          bg: props.colorMode === 'dark' ? 'moodle.700' : 'moodle.600',
        },
      }),
      bbb: (props) => ({
        bg: props.colorMode === 'dark' ? 'bbb.600' : 'bbb.500',
        color: 'white',
        _hover: {
          bg: props.colorMode === 'dark' ? 'bbb.700' : 'bbb.600',
        },
      }),
      wiki: (props) => ({
        bg: props.colorMode === 'dark' ? 'wiki.600' : 'wiki.500',
        color: 'white',
        _hover: {
          bg: props.colorMode === 'dark' ? 'wiki.700' : 'wiki.600',
        },
      }),
      handbook: (props) => ({
        bg: props.colorMode === 'dark' ? 'handbook.600' : 'handbook.500',
        color: 'white',
        _hover: {
          bg: props.colorMode === 'dark' ? 'handbook.700' : 'handbook.600',
        },
      }),
      taskcards: (props) => ({
        bg: props.colorMode === 'dark' ? 'taskcards.600' : 'taskcards.500',
        color: 'white',
        _hover: {
          bg: props.colorMode === 'dark' ? 'taskcards.700' : 'taskcards.600',
        },
      }),
      cryptpad: (props) => ({
        bg: props.colorMode === 'dark' ? 'cryptpad.600' : 'cryptpad.500',
        color: 'white',
        _hover: {
          bg: props.colorMode === 'dark' ? 'cryptpad.700' : 'cryptpad.600',
        },
      }),
      lilac: (props) => ({
        bg: props.colorMode === 'dark' ? 'lilac.600' : 'lilac.500',
        color: 'white',
        _hover: {
          bg: props.colorMode === 'dark' ? 'lilac.700' : 'lilac.600',
        },
      }),
      blue: (props) => ({
        bg: props.colorMode === 'dark' ? 'blue.600' : 'blue.500',
        color: 'white',
        _hover: {
          bg: props.colorMode === 'dark' ? 'blue.700' : 'blue.600',
        },
      }),
      orange: (props) => ({
        bg: props.colorMode === 'dark' ? 'orange.600' : 'orange.500',
        color: 'white',
        _hover: {
          bg: props.colorMode === 'dark' ? 'orange.700' : 'orange.600',
        },
      }),
      darkred: (props) => ({
        bg: props.colorMode === 'dark' ? 'darkred.600' : 'darkred.500',
        color: 'white',
        _hover: {
          bg: props.colorMode === 'dark' ? 'darkred.700' : 'darkred.600',
        },
      }),
    },
  },
  Card: {
    baseStyle: (props) => ({
      container: {
        bg: props.colorMode === 'dark' ? '#1F1F1F' : 'white',
        boxShadow: 'md',
        borderRadius: 'lg',
      },
    }),
  },
};

const styles = {
  global: (props) => ({
    'html, body': {
      bg: props.colorMode === 'dark' ? 'gray.900' : 'gray.50',
      overflow: 'hidden',
    },
    '.navigation-bar': {
      bg: props.colorMode === 'dark' ? '#1F1F1F' : 'white',
      borderBottomColor: props.colorMode === 'dark' ? 'gray.700' : 'gray.200',
    },
    '.nav-button': {
      bg: props.colorMode === 'dark' ? 'gray.700' : 'gray.100',
      color: props.colorMode === 'dark' ? 'white' : 'black',
    },
    '.nav-button:hover': {
      bg: props.colorMode === 'dark' ? 'gray.600' : 'gray.200',
    },
  }),
};

const theme = extendTheme({
  config,
  colors,
  components,
  styles,
});

export default theme;
