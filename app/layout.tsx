import type { Metadata } from 'next'
import { Inter, Press_Start_2P, VT323, JetBrains_Mono } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

// Primary / Body — gold standard screen-readable sans
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
})

// Display / Hero — retro arcade pixel font (hero titles, league names, match numbers)
// Mapped to --font-orbitron so all existing .font-orbitron classes pick it up automatically
const pressStart2P = Press_Start_2P({
  subsets: ['latin'],
  variable: '--font-orbitron',
  weight: '400',
  display: 'swap',
})

// Subheadings / Labels — retro terminal style (headings, badges, nav, subheadings)
// Mapped to --font-rajdhani so all existing .font-rajdhani classes pick it up automatically
const vt323 = VT323({
  subsets: ['latin'],
  variable: '--font-rajdhani',
  weight: '400',
  display: 'swap',
})

// Numerics — true tabular monospace (scores, points, bids, timers, prices)
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: 'IPL Fantasy 2026',
  description: 'Private IPL fantasy league',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${pressStart2P.variable} ${vt323.variable} ${jetbrainsMono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
