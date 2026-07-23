import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Design-kit typography: Plus Jakarta Sans (display/headings) + Rubik (body).
// Self-hosted via @fontsource — no third-party font CDN at runtime.
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import { WebThemeProvider } from '@clevrook/theme/web';
import App from './App';
import { brandPrimitives } from './theme/brand';
import './styles.css';

// Every component below reads colors/typography/spacing from this provider.
// Swap `mode` for `useColorScheme()` from @clevrook/theme to follow the OS theme.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WebThemeProvider primitives={brandPrimitives} mode="light" style={{ minHeight: '100vh' }}>
      <App />
    </WebThemeProvider>
  </StrictMode>,
);
