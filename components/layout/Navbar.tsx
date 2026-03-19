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
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#ff6b00] flex items-center justify-center text-white font-black text-sm">
            🏏
          </div>
          <div>
            <span className="font-bold text-white hidden sm:block">IPL</span>
            <span className="font-bold text-[#ff6b00] hidden sm:block">Fantasy</span>
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
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'text-white bg-white/8'
                    : 'text-[#8891b0] hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:block">{label}</span>
                {active && (
                  <span className="hidden sm:block w-1 h-1 rounded-full bg-[#ff6b00] ml-0.5" />
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
