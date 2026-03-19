'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trophy, LayoutDashboard, LogOut, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function Navbar() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navLink = cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground hover:text-foreground')

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-[#ff6b00]">
          <span className="text-xl">🏏</span>
          <span className="hidden sm:block">IPL Fantasy 2026</span>
          <span className="sm:hidden">Fantasy</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          <Link href="/dashboard" className={navLink}>
            <LayoutDashboard className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:block">Dashboard</span>
          </Link>
          <Link href="/matches" className={navLink}>
            <Trophy className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:block">Matches</span>
          </Link>
          <Link href="/admin" className={navLink}>
            <Shield className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:block">Admin</span>
          </Link>
          <button
            onClick={handleSignOut}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground hover:text-destructive')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </nav>
  )
}
