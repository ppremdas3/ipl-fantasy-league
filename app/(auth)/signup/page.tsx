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

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, full_name: username } },
    })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Account created! Check your email to confirm.')
      router.push('/login')
    }
    setLoading(false)
  }

  return (
    <ScaleIn>
      <div className="glass-panel rounded-2xl overflow-hidden">
        {/* Card header bar */}
        <div
          className="clip-angle-br px-6 pt-5 pb-4"
          style={{
            background: 'linear-gradient(135deg, rgba(255,107,0,0.08) 0%, rgba(0,212,255,0.06) 100%)',
            borderBottom: '1px solid rgba(255,107,0,0.12)',
          }}
        >
          <h2 className="font-orbitron text-base font-700 tracking-widest uppercase text-white">
            Create Account
          </h2>
          <p className="font-rajdhani text-xs tracking-wider text-[#5a7a9a] mt-0.5">
            Join IPL Fantasy 2026
          </p>
        </div>

        <div className="px-6 py-5">
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="font-rajdhani text-xs tracking-[0.15em] uppercase text-[#5a7a9a]">
                Display Name
              </Label>
              <Input
                id="username"
                placeholder="e.g. Virat Fan"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                className="bg-[#080e1c] border-[#0e2040] focus:border-[#ff6b00]/60 focus:ring-0 text-white placeholder:text-[#2a3a55] font-rajdhani"
              />
            </div>
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
                className="bg-[#080e1c] border-[#0e2040] focus:border-[#ff6b00]/60 focus:ring-0 text-white placeholder:text-[#2a3a55] font-rajdhani"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="font-rajdhani text-xs tracking-[0.15em] uppercase text-[#5a7a9a]">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Min 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="bg-[#080e1c] border-[#0e2040] focus:border-[#ff6b00]/60 focus:ring-0 text-white placeholder:text-[#2a3a55] font-rajdhani"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-2.5 rounded-xl overflow-hidden font-rajdhani font-700 tracking-[0.15em] uppercase text-sm text-white transition-all disabled:opacity-60 mt-2"
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
                  Creating account…
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <p className="mt-4 text-center font-rajdhani text-xs tracking-wider text-[#5a7a9a]">
            Already have an account?{' '}
            <Link href="/login" className="text-[#00d4ff] hover:text-white transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </ScaleIn>
  )
}
