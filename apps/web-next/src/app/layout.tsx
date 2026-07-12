import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClevScaffold · Next',
  description: 'Next.js App Router sample wired to the ClevScaffold API',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
