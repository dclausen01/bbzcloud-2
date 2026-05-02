import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import App from './App';
import OverlaySurface from './components/OverlaySurface';
import theme from './theme';
import { SettingsProvider } from './context/SettingsContext';
import ErrorBoundary from './components/ErrorBoundary';
import { setupGlobalErrorHandling } from './utils/errorHandler';

// Set up global error handling
setupGlobalErrorHandling();

// Surface switcher — the same React bundle is loaded both in the main window
// and in the overlay BrowserWindow. The overlay window passes ?surface=overlay
// in the URL to opt into the lightweight OverlaySurface (no SettingsProvider,
// no App-level state).
const params = new URLSearchParams(window.location.search);
const surface = params.get('surface');

const container = document.getElementById('root');
const root = createRoot(container);

if (surface === 'overlay') {
  root.render(
    <React.StrictMode>
      <ChakraProvider theme={theme}>
        <ColorModeScript initialColorMode={theme.config.initialColorMode} storageKey={theme.config.storageKey} />
        <ErrorBoundary>
          <OverlaySurface />
        </ErrorBoundary>
      </ChakraProvider>
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <ChakraProvider theme={theme}>
        <ColorModeScript initialColorMode={theme.config.initialColorMode} storageKey={theme.config.storageKey} />
        <ErrorBoundary>
          <SettingsProvider>
            <App />
          </SettingsProvider>
        </ErrorBoundary>
      </ChakraProvider>
    </React.StrictMode>
  );
}
