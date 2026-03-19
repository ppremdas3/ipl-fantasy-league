'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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

    // Create league
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

    // Add commissioner as a member
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
      <h1 className="text-2xl font-bold mb-6">Create a League</h1>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>League settings</CardTitle>
          <CardDescription>You&apos;ll be the commissioner and can manage the auction.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">League name</Label>
              <Input
                id="name"
                placeholder="e.g. Office Champions 2026"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teamName">Your team name</Label>
              <Input
                id="teamName"
                placeholder="e.g. Bolt Strikers"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                className="bg-input border-border"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxTeams">Max teams</Label>
                <Input
                  id="maxTeams"
                  type="number"
                  min={2}
                  max={15}
                  value={maxTeams}
                  onChange={e => setMaxTeams(Number(e.target.value))}
                  className="bg-input border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget">Budget (₹Cr)</Label>
                <Input
                  id="budget"
                  type="number"
                  min={50}
                  max={200}
                  value={budget / 100}
                  onChange={e => setBudget(Number(e.target.value) * 100)}
                  className="bg-input border-border"
                />
                <p className="text-xs text-muted-foreground">per team in crores</p>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-[#ff6b00] hover:bg-[#e55c00] text-white font-semibold"
              disabled={loading}
            >
              {loading ? 'Creating…' : 'Create League'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
