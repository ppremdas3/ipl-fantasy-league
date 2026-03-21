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
  const [isCommissioner, setIsCommissioner] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
        .then(({ data }) => setDisplayName((data as { display_name: string } | null)?.display_name ?? null))
      supabase.from('leagues').select('id').eq('commissioner_id', user.id).limit(1)
        .then(({ data }) => setIsCommissioner((data ?? []).length > 0))
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
    { href: '/matches',   label: 'Matches',   icon: Trophy },
    ...(isCommissioner ? [{ href: '/admin', label: 'Admin', icon: Shield }] : []),
  ]

  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        background: 'rgba(7, 11, 20, 0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0, 212, 255, 0.07)',
        boxShadow: '0 1px 0 rgba(0,212,255,0.04), 0 4px 24px rgba(0,0,0,0.5)',
      }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px]"
        style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(0,212,255,0.35) 40%, rgba(255,107,0,0.25) 65%, transparent 100%)' }}
      />

      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link href="/dashboard" className="shrink-0 font-orbitron text-xs tracking-widest uppercase text-white/90 hover:text-white transition-colors">
          IPL Fantasy League
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'relative flex items-center gap-1.5 px-3 py-2 rounded-lg font-rajdhani font-600 text-xs tracking-widest uppercase transition-all duration-200',
                  active
                    ? 'text-[#00d4ff]'
                    : 'text-[#5a7a9a] hover:text-white hover:bg-white/[0.04]'
                )}
                style={active ? { background: 'rgba(0,212,255,0.07)' } : {}}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:block">{label}</span>
                {/* Active underline glow */}
                {active && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ background: 'linear-gradient(90deg, transparent, #00d4ff, transparent)', boxShadow: '0 0 6px rgba(0,212,255,0.8)' }}
                  />
                )}
              </Link>
            )
          })}
        </div>

        {/* User / Sign out */}
        <div className="flex items-center gap-2.5 shrink-0">
          {displayName && (
            <div className="hidden sm:flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-black font-orbitron"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,107,0,0.3), rgba(255,107,0,0.1))',
                  border: '1px solid rgba(255,107,0,0.35)',
                  boxShadow: '0 0 8px rgba(255,107,0,0.2)',
                }}
              >
                {displayName.slice(0, 2).toUpperCase()}
              </div>
              <p className="text-xs font-rajdhani font-600 tracking-wider text-white/80">{displayName}</p>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#5a7a9a] hover:text-white hover:bg-white/5 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </nav>
  )
}
