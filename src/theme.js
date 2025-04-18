import { extendTheme } from '@chakra-ui/react';
import { defaultSchoolConfig } from './components/SchoolCustomization';

const config = {
  initialColorMode: 'light',
  useSystemColorMode: false,
  cssVarPrefix: 'bbz',
  // Enable color mode storage in localStorage
  storageKey: 'bbz-color-mode'
};

// Helper function to generate color scales from a base color
const generateColorScale = (baseColor) => {
  // This is a simplified version - in a real app, you might use a library like chroma.js
  // to generate proper color scales with correct lightness/darkness variations
  
  // Convert hex to RGB
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };
  
  // Adjust RGB values to create lighter/darker variants
  const adjustColor = (rgb, amount) => {
    return {
      r: Math.max(0, Math.min(255, rgb.r + amount)),
      g: Math.max(0, Math.min(255, rgb.g + amount)),
      b: Math.max(0, Math.min(255, rgb.b + amount))
    };
  };
  
  // Convert RGB back to hex
  const rgbToHex = (rgb) => {
    return '#' + [rgb.r, rgb.g, rgb.b]
      .map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('');
  };
  
  const rgb = hexToRgb(baseColor);
  if (!rgb) return {};
  
  return {
    50: rgbToHex(adjustColor(rgb, 120)),
    100: rgbToHex(adjustColor(rgb, 80)),
    200: rgbToHex(adjustColor(rgb, 60)),
    300: rgbToHex(adjustColor(rgb, 40)),
    400: rgbToHex(adjustColor(rgb, 20)),
    500: baseColor,
    600: rgbToHex(adjustColor(rgb, -20)),
    700: rgbToHex(adjustColor(rgb, -40)),
    800: rgbToHex(adjustColor(rgb, -60)),
    900: rgbToHex(adjustColor(rgb, -80)),
  };
};

// Get colors from SchoolCustomization
const { colors: schoolColors } = defaultSchoolConfig.theme;

// Generate color scales for all theme colors
const colors = {
  brand: generateColorScale(defaultSchoolConfig.theme.primaryColor),
  schulcloud: generateColorScale(schoolColors.schulcloud),
  moodle: generateColorScale(schoolColors.moodle),
  bbb: generateColorScale(schoolColors.bbb),
  wiki: generateColorScale(schoolColors.wiki),
  handbook: generateColorScale(schoolColors.handbook),
  taskcards: generateColorScale(schoolColors.taskcards),
  cryptpad: generateColorScale(schoolColors.cryptpad),
  lilac: generateColorScale(schoolColors.lilac),
  blue: generateColorScale(schoolColors.blue),
  orange: generateColorScale(schoolColors.orange),
  darkred: generateColorScale(schoolColors.darkred),
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
