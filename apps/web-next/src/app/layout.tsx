import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClevScaffold · Next',
  description: 'Next.js App Router sample wired to the ClevScaffold API',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Design-kit theme for the whole tree — see src/app/providers.tsx. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
