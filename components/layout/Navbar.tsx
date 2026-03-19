'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Trophy, Shield, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [displayName, setDisplayName] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
        .then(({ data }) => setDisplayName((data as { display_name: string } | null)?.display_name ?? null))
    })
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/matches', label: 'Matches', icon: Trophy },
    { href: '/admin', label: 'Admin', icon: Shield },
  ]

  return (
    <nav className="sticky top-0 z-50 glass border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
            style={{ background: 'linear-gradient(135deg, #ff6b00, #ff9500)', boxShadow: '0 0 16px rgba(255,107,0,0.5)' }}>
            🏏
          </div>
          <div className="hidden sm:flex flex-col leading-none gap-0.5">
            <span className="font-orbitron text-[11px] font-700 tracking-[0.15em] text-[#00d4ff] uppercase">Fantasy</span>
            <span className="font-orbitron text-sm font-900 tracking-[0.08em] text-white uppercase">IPL 2026</span>
          </div>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-rajdhani font-600 tracking-widest uppercase transition-all',
                  active
                    ? 'text-[#00d4ff] bg-[#00d4ff]/8'
                    : 'text-[#5a7a9a] hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:block">{label}</span>
                {active && (
                  <span className="hidden sm:block w-1 h-1 rounded-full bg-[#00d4ff] ml-0.5" />
                )}
              </Link>
            )
          })}
        </div>

        {/* User / Sign out */}
        <div className="flex items-center gap-3">
          {displayName && (
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#ff6b00] to-[#e55c00] flex items-center justify-center text-white text-xs font-bold">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="leading-tight">
                <p className="text-xs font-semibold text-white">{displayName}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8891b0] hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </nav>
  )
}
