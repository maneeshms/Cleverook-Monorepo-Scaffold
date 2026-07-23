'use client';

/**
 * Client boundary for the Clevrook Design Kit.
 *
 * `WebThemeProvider` and every kit component use React hooks, so they cannot
 * live in a Server Component. The root layout stays a Server Component and wraps
 * its children in this one — the standard App Router pattern.
 */
// Design-kit typography: Plus Jakarta Sans (display/headings) + Rubik (body).
// Self-hosted via @fontsource — no third-party font CDN at runtime.
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import { WebThemeProvider } from '@clevrook/theme/web';
import { brandPrimitives } from '@/theme/brand';

export function Providers({ children }: { children: React.ReactNode }) {
  // Swap `mode` for `useColorScheme()` from @clevrook/theme to follow the OS theme.
  return (
    <WebThemeProvider primitives={brandPrimitives} mode="light" style={{ minHeight: '100vh' }}>
      {children}
    </WebThemeProvider>
  );
}
