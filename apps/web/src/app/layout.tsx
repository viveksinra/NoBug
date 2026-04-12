import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NoBug — AI-Native Bug Tracking',
  description:
    'Bug tracking, test management, and AI agent integration platform with browser extension for instant bug capture.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
