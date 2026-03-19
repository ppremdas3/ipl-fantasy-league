'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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

    // Find league by invite code
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

    // Check member count
    const { count } = await supabase
      .from('league_members')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', league.id)

    if (count !== null && count >= league.max_teams) {
      toast.error('This league is full.')
      setLoading(false)
      return
    }

    // Check if already a member
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

    // Join
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
      <h1 className="text-2xl font-bold mb-6">Join a League</h1>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Enter invite code</CardTitle>
          <CardDescription>Get the code from your league commissioner.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Invite code</Label>
              <Input
                id="code"
                placeholder="e.g. AB12CD34"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                required
                className="bg-input border-border font-mono tracking-widest uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teamName">Your team name</Label>
              <Input
                id="teamName"
                placeholder="e.g. Thunder Strikers"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                className="bg-input border-border"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-[#ff6b00] hover:bg-[#e55c00] text-white font-semibold"
              disabled={loading}
            >
              {loading ? 'Joining…' : 'Join League'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
