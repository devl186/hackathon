import Script from 'next/script';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'MiniDSP' };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        {/* Versioned Lepidus stylesheet required by design.md §2. */}
        <link rel="stylesheet" href="https://lepide-design-system.vercel.app/v1/lepidus.css" />
      </head>
      <body>
        {children}
        <Script src="https://lepide-design-system.vercel.app/v1/lepidus.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
