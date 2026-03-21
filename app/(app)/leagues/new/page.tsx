'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScaleIn } from '@/components/ui/motion'
import { Loader2, Trophy } from 'lucide-react'

export default function NewLeaguePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [maxTeams, setMaxTeams] = useState(10)
  const [budget, setBudget] = useState(10000) // lakhs
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Not logged in'); setLoading(false); return }

    const { data: league, error: leagueErr } = await supabase
      .from('leagues')
      .insert({
        name,
        commissioner_id: user.id,
        max_teams: maxTeams,
        budget_per_team: budget,
        status: 'setup',
      })
      .select()
      .single()

    if (leagueErr || !league) {
      toast.error(leagueErr?.message ?? 'Failed to create league')
      setLoading(false)
      return
    }

    const { error: memberErr } = await supabase
      .from('league_members')
      .insert({
        league_id: league.id,
        user_id: user.id,
        team_name: teamName || name + "'s Team",
        budget_remaining: budget,
      })

    if (memberErr) {
      toast.error(memberErr.message)
      setLoading(false)
      return
    }

    toast.success(`League "${name}" created! Share the invite code: ${league.invite_code}`)
    router.push(`/leagues/${league.id}`)
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <p className="font-rajdhani text-xs tracking-[0.3em] uppercase text-[#5a7a9a] mb-1">Commissioner</p>
        <h1 className="font-orbitron text-2xl font-900 tracking-wide uppercase text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#ff6b00]" />
          Create a League
        </h1>
      </div>

      <ScaleIn>
        <div className="card-hud rounded-2xl overflow-hidden">
          <div
            className="clip-angle-br px-5 pt-4 pb-3.5"
            style={{
              background: 'linear-gradient(135deg, rgba(255,107,0,0.07) 0%, rgba(255,107,0,0.03) 100%)',
              borderBottom: '1px solid rgba(255,107,0,0.12)',
            }}
          >
            <p className="font-orbitron text-xs font-700 tracking-widest uppercase text-white">League Settings</p>
            <p className="font-rajdhani text-xs tracking-wider text-[#5a7a9a] mt-0.5">You'll be the commissioner and can manage everything</p>
          </div>

          <div className="px-5 py-5">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="font-rajdhani text-xs tracking-[0.15em] uppercase text-[#5a7a9a]">
                  League Name
                </Label>
                <Input
                  id="name"
                  placeholder="e.g. Office Champions 2026"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="bg-[#080e1c] border-[#0e2040] focus:border-[#ff6b00]/60 focus:ring-0 text-white placeholder:text-[#2a3a55] font-rajdhani"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="teamName" className="font-rajdhani text-xs tracking-[0.15em] uppercase text-[#5a7a9a]">
                  Your Team Name
                </Label>
                <Input
                  id="teamName"
                  placeholder="e.g. Bolt Strikers"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  className="bg-[#080e1c] border-[#0e2040] focus:border-[#ff6b00]/60 focus:ring-0 text-white placeholder:text-[#2a3a55] font-rajdhani"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="maxTeams" className="font-rajdhani text-xs tracking-[0.15em] uppercase text-[#5a7a9a]">
                    Max Teams
                  </Label>
                  <Input
                    id="maxTeams"
                    type="number"
                    min={2}
                    max={15}
                    value={maxTeams}
                    onChange={e => setMaxTeams(Number(e.target.value))}
                    className="bg-[#080e1c] border-[#0e2040] focus:border-[#ff6b00]/60 focus:ring-0 text-white font-rajdhani"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="budget" className="font-rajdhani text-xs tracking-[0.15em] uppercase text-[#5a7a9a]">
                    Budget (₹Cr)
                  </Label>
                  <Input
                    id="budget"
                    type="number"
                    min={50}
                    max={200}
                    value={budget / 100}
                    onChange={e => setBudget(Number(e.target.value) * 100)}
                    className="bg-[#080e1c] border-[#0e2040] focus:border-[#ff6b00]/60 focus:ring-0 text-white font-rajdhani"
                  />
                  <p className="font-rajdhani text-[10px] tracking-wider text-[#5a7a9a]">per team in crores</p>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-rajdhani font-700 tracking-[0.15em] uppercase text-sm text-white transition-all disabled:opacity-60 mt-2"
                style={{
                  background: loading ? 'rgba(255,107,0,0.4)' : 'linear-gradient(135deg, #ff8800, #ff6b00)',
                  boxShadow: loading ? 'none' : '0 0 20px rgba(255,107,0,0.4)',
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating…
                  </span>
                ) : 'Create League'}
              </button>
            </form>
          </div>
        </div>
      </ScaleIn>
    </div>
  )
}
