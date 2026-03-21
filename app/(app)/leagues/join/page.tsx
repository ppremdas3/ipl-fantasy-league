'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScaleIn } from '@/components/ui/motion'
import { Loader2, Users } from 'lucide-react'

export default function JoinLeaguePage() {
  const router = useRouter()
  const [inviteCode, setInviteCode] = useState('')
  const [teamName, setTeamName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Not logged in'); setLoading(false); return }

    const { data: league, error: leagueErr } = await supabase
      .from('leagues')
      .select('id, name, budget_per_team, max_teams, status')
      .eq('invite_code', inviteCode.toUpperCase().trim())
      .single()

    if (leagueErr || !league) {
      toast.error('Invalid invite code. Double-check and try again.')
      setLoading(false)
      return
    }

    if (league.status === 'completed') {
      toast.error('This league has already completed.')
      setLoading(false)
      return
    }

    const { count } = await supabase
      .from('league_members')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', league.id)

    if (count !== null && count >= league.max_teams) {
      toast.error('This league is full.')
      setLoading(false)
      return
    }

    const { data: existing } = await supabase
      .from('league_members')
      .select('id')
      .eq('league_id', league.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      toast.info('You are already in this league.')
      router.push(`/leagues/${league.id}`)
      setLoading(false)
      return
    }

    const { error: joinErr } = await supabase
      .from('league_members')
      .insert({
        league_id: league.id,
        user_id: user.id,
        team_name: teamName || `${user.email?.split('@')[0]}'s Team`,
        budget_remaining: league.budget_per_team,
      })

    if (joinErr) {
      toast.error(joinErr.message)
      setLoading(false)
      return
    }

    toast.success(`Joined "${league.name}"!`)
    router.push(`/leagues/${league.id}`)
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-6">
        <p className="font-rajdhani text-xs tracking-[0.3em] uppercase text-[#5a7a9a] mb-1">League</p>
        <h1 className="font-orbitron text-2xl font-900 tracking-wide uppercase text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-[#00d4ff]" />
          Join a League
        </h1>
      </div>

      <ScaleIn>
        <div className="card-hud rounded-2xl overflow-hidden">
          <div
            className="clip-angle-br px-5 pt-4 pb-3.5"
            style={{
              background: 'linear-gradient(135deg, rgba(0,212,255,0.07) 0%, rgba(0,212,255,0.03) 100%)',
              borderBottom: '1px solid rgba(0,212,255,0.1)',
            }}
          >
            <p className="font-orbitron text-xs font-700 tracking-widest uppercase text-white">Enter Invite Code</p>
            <p className="font-rajdhani text-xs tracking-wider text-[#5a7a9a] mt-0.5">Get the code from your league commissioner</p>
          </div>

          <div className="px-5 py-5">
            <form onSubmit={handleJoin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="code" className="font-rajdhani text-xs tracking-[0.15em] uppercase text-[#5a7a9a]">
                  Invite Code
                </Label>
                <Input
                  id="code"
                  placeholder="e.g. AB12CD34"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  required
                  className="bg-[#080e1c] border-[#0e2040] focus:border-[#00d4ff]/60 focus:ring-0 text-white placeholder:text-[#2a3a55] font-mono tracking-[0.3em] uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="teamName" className="font-rajdhani text-xs tracking-[0.15em] uppercase text-[#5a7a9a]">
                  Your Team Name
                </Label>
                <Input
                  id="teamName"
                  placeholder="e.g. Thunder Strikers"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  className="bg-[#080e1c] border-[#0e2040] focus:border-[#00d4ff]/60 focus:ring-0 text-white placeholder:text-[#2a3a55] font-rajdhani"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-rajdhani font-700 tracking-[0.15em] uppercase text-sm text-white transition-all disabled:opacity-60"
                style={{
                  background: loading ? 'rgba(255,107,0,0.4)' : 'linear-gradient(135deg, #ff8800, #ff6b00)',
                  boxShadow: loading ? 'none' : '0 0 20px rgba(255,107,0,0.4)',
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Joining…
                  </span>
                ) : 'Join League'}
              </button>
            </form>
          </div>
        </div>
      </ScaleIn>
    </div>
  )
}
