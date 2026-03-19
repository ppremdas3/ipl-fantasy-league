import type { Metadata } from 'next'
import { Inter, Orbitron, Rajdhani } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const orbitron = Orbitron({ subsets: ['latin'], variable: '--font-orbitron', weight: ['600', '700', '800', '900'] })
const rajdhani = Rajdhani({ subsets: ['latin'], variable: '--font-rajdhani', weight: ['500', '600', '700'] })

export const metadata: Metadata = {
  title: 'IPL Fantasy 2026',
  description: 'Private IPL fantasy league',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${orbitron.variable} ${rajdhani.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
