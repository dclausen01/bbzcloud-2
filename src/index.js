import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import App from './App';
import theme from './theme';
import { SettingsProvider } from './context/SettingsContext';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} storageKey={theme.config.storageKey} />
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </ChakraProvider>
  </React.StrictMode>
);
