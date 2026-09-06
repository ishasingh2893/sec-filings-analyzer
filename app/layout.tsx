import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title: 'Filing Notes — Isha', description: 'Read a 10-K, review the financials, and explore company valuation.'};
export default function RootLayout({children}: {children: React.ReactNode}) {return <html lang="en"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap" /></head><body>{children}</body></html>}
