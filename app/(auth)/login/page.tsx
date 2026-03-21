'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScaleIn } from '@/components/ui/motion'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error(error.message)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleGoogleLogin() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <ScaleIn>
      <div className="glass-panel rounded-2xl overflow-hidden">
        {/* Card header bar */}
        <div
          className="clip-angle-br px-6 pt-5 pb-4"
          style={{
            background: 'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(255,107,0,0.06) 100%)',
            borderBottom: '1px solid rgba(0,212,255,0.1)',
          }}
        >
          <h2 className="font-orbitron text-base font-700 tracking-widest uppercase text-white">
            Sign In
          </h2>
          <p className="font-rajdhani text-xs tracking-wider text-[#5a7a9a] mt-0.5">
            Enter your credentials to access your league
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Google */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl border border-[#0e2040] hover:border-[#00d4ff]/40 bg-[#0a1628] hover:bg-[#0d1e38] text-sm text-white font-rajdhani font-600 tracking-wider transition-all"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#0e2040]" />
            <span className="font-rajdhani text-xs tracking-[0.2em] uppercase text-[#5a7a9a]">or</span>
            <div className="flex-1 h-px bg-[#0e2040]" />
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="font-rajdhani text-xs tracking-[0.15em] uppercase text-[#5a7a9a]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="bg-[#080e1c] border-[#0e2040] focus:border-[#00d4ff]/60 focus:ring-0 text-white placeholder:text-[#2a3a55] font-rajdhani"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="font-rajdhani text-xs tracking-[0.15em] uppercase text-[#5a7a9a]">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="bg-[#080e1c] border-[#0e2040] focus:border-[#00d4ff]/60 focus:ring-0 text-white placeholder:text-[#2a3a55] font-rajdhani"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-2.5 rounded-xl overflow-hidden font-rajdhani font-700 tracking-[0.15em] uppercase text-sm text-white transition-all disabled:opacity-60"
              style={{
                background: loading
                  ? 'rgba(255,107,0,0.4)'
                  : 'linear-gradient(135deg, #ff8800 0%, #ff6b00 50%, #e55000 100%)',
                boxShadow: loading ? 'none' : '0 0 20px rgba(255,107,0,0.4)',
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="text-center font-rajdhani text-xs tracking-wider text-[#5a7a9a]">
            No account?{' '}
            <Link href="/signup" className="text-[#00d4ff] hover:text-white transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </ScaleIn>
  )
}
