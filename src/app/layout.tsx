import type { ReactNode } from 'react';

export const metadata = { title: 'MiniDSP' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
