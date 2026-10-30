import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ShipCheck — Website quality, in focus',
  description:
    'A real browser. Actionable evidence. Know what to fix before you ship.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
