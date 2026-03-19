'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { createClient as createTypedClient } from '@/lib/supabase/client'
import { IplMatch, IplPlayer, League } from '@/lib/supabase/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

interface PerformanceRow {
  player_id: string
  player_name: string
  runs: number
  balls_faced: number
  fours: number
  sixes: number
  is_duck: boolean
  wickets: number
  overs_bowled: number
  runs_conceded: number
  maidens: number
  catches: number
  stumpings: number
  run_outs_direct: number
  run_outs_assist: number
  is_playing_xi: boolean
}

export default function AdminPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createTypedClient() as any
  const [myLeagues, setMyLeagues] = useState<League[]>([])
  const [selectedLeagueId, setSelectedLeagueId] = useState('')
  const [matches, setMatches] = useState<IplMatch[]>([])
  const [selectedMatchId, setSelectedMatchId] = useState('')
  const [players, setPlayers] = useState<IplPlayer[]>([])
  const [performances, setPerformances] = useState<PerformanceRow[]>([])
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  // New match form
  const [newMatch, setNewMatch] = useState({
    match_number: '',
    team1: '',
    team2: '',
    venue: '',
    scheduled_at: '',
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('leagues')
        .select('*')
        .eq('commissioner_id', user.id)
      setMyLeagues(data ?? [])
    }
    load()
  }, [supabase])

  useEffect(() => {
    if (!selectedLeagueId) return
    supabase.from('ipl_matches').select('*').order('match_number').then(({ data }: { data: IplMatch[] | null }) => setMatches(data ?? []))
    supabase.from('ipl_players').select('*').order('name').then(({ data }: { data: IplPlayer[] | null }) => setPlayers(data ?? []))
  }, [supabase, selectedLeagueId])

  function initPerformances(playerList: IplPlayer[]) {
    setPerformances(playerList.map(p => ({
      player_id: p.id,
      player_name: p.name,
      runs: 0, balls_faced: 0, fours: 0, sixes: 0, is_duck: false,
      wickets: 0, overs_bowled: 0, runs_conceded: 0, maidens: 0,
      catches: 0, stumpings: 0, run_outs_direct: 0, run_outs_assist: 0,
      is_playing_xi: false,
    })))
  }

  function updatePerf(index: number, field: keyof PerformanceRow, value: number | boolean) {
    setPerformances(prev => {
      const next = [...prev]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(next[index] as any)[field] = value
      return next
    })
  }

  async function savePerformances() {
    if (!selectedMatchId) { toast.error('Select a match'); return }
    setSaving(true)
    const playing = performances.filter(p => p.is_playing_xi)
    if (playing.length === 0) { toast.error('Mark at least one player as playing'); setSaving(false); return }

    const rows = playing.map(p => ({
      match_id: selectedMatchId,
      player_id: p.player_id,
      runs: p.runs, balls_faced: p.balls_faced, fours: p.fours, sixes: p.sixes,
      is_duck: p.is_duck,
      wickets: p.wickets, overs_bowled: p.overs_bowled, runs_conceded: p.runs_conceded, maidens: p.maidens,
      catches: p.catches, stumpings: p.stumpings, run_outs_direct: p.run_outs_direct, run_outs_assist: p.run_outs_assist,
      is_playing_xi: true,
    }))

    const { error } = await supabase
      .from('player_performances')
      .upsert(rows, { onConflict: 'match_id,player_id' })

    if (error) toast.error(error.message)
    else toast.success(`Saved ${rows.length} performances!`)
    setSaving(false)
  }

  async function handleRecalculate() {
    if (!selectedMatchId || !selectedLeagueId) {
      toast.error('Select both a match and a league')
      return
    }
    setRecalculating(true)
    const res = await fetch('/api/points/recalculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_id: selectedMatchId, league_id: selectedLeagueId }),
    })
    const data = await res.json()
    if (!res.ok) toast.error(data.error)
    else toast.success(`Points recalculated! ${data.members_updated} teams updated.`)
    setRecalculating(false)
  }

  async function addMatch(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('ipl_matches').insert({
      match_number: parseInt(newMatch.match_number),
      team1: newMatch.team1,
      team2: newMatch.team2,
      venue: newMatch.venue,
      scheduled_at: newMatch.scheduled_at || null,
      status: 'upcoming',
    })
    if (error) toast.error(error.message)
    else {
      toast.success('Match added!')
      setNewMatch({ match_number: '', team1: '', team2: '', venue: '', scheduled_at: '' })
      const { data } = await supabase.from('ipl_matches').select('*').order('match_number')
      setMatches(data ?? [])
    }
  }

  const playingCount = performances.filter(p => p.is_playing_xi).length

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-muted-foreground text-sm mt-1">Commissioner tools — manage matches, scores, and points</p>
      </div>

      {/* League selector */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Your Leagues (Commissioner)</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            value={selectedLeagueId}
            onChange={e => setSelectedLeagueId(e.target.value)}
            className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
          >
            <option value="">Select a league</option>
            {myLeagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </CardContent>
      </Card>

      {/* Add match */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Add IPL Match</CardTitle>
          <CardDescription>Add matches to the schedule</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={addMatch} className="grid grid-cols-2 gap-3">
            <div>
              <Label>Match #</Label>
              <Input value={newMatch.match_number} onChange={e => setNewMatch(p => ({ ...p, match_number: e.target.value }))} placeholder="1" className="bg-input border-border mt-1" required />
            </div>
            <div>
              <Label>Date & Time</Label>
              <Input type="datetime-local" value={newMatch.scheduled_at} onChange={e => setNewMatch(p => ({ ...p, scheduled_at: e.target.value }))} className="bg-input border-border mt-1" />
            </div>
            <div>
              <Label>Team 1</Label>
              <Input value={newMatch.team1} onChange={e => setNewMatch(p => ({ ...p, team1: e.target.value }))} placeholder="MI" className="bg-input border-border mt-1" required />
            </div>
            <div>
              <Label>Team 2</Label>
              <Input value={newMatch.team2} onChange={e => setNewMatch(p => ({ ...p, team2: e.target.value }))} placeholder="CSK" className="bg-input border-border mt-1" required />
            </div>
            <div className="col-span-2">
              <Label>Venue</Label>
              <Input value={newMatch.venue} onChange={e => setNewMatch(p => ({ ...p, venue: e.target.value }))} placeholder="Wankhede Stadium" className="bg-input border-border mt-1" />
            </div>
            <div className="col-span-2">
              <Button type="submit" className="bg-[#ff6b00] hover:bg-[#e55c00] text-white">Add Match</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Score entry */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Enter Match Performances</CardTitle>
          <CardDescription>Select a completed match, mark players, fill stats, then recalculate points.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <select
              value={selectedMatchId}
              onChange={e => {
                setSelectedMatchId(e.target.value)
                if (players.length > 0) initPerformances(players)
              }}
              className="flex-1 bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              <option value="">Select match</option>
              {matches.map(m => (
                <option key={m.id} value={m.id}>
                  Match #{m.match_number}: {m.team1} vs {m.team2}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => initPerformances(players)}
              disabled={!selectedMatchId}
              className="border-border hover:border-[#ff6b00]"
            >
              Reset form
            </Button>
          </div>

          {selectedMatchId && performances.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                Check &quot;Playing&quot; for each player who played. {playingCount} marked.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left py-2 w-32">Player</th>
                      <th className="text-center py-2 w-12">Play</th>
                      <th className="text-center py-2">R</th>
                      <th className="text-center py-2">B</th>
                      <th className="text-center py-2">4s</th>
                      <th className="text-center py-2">6s</th>
                      <th className="text-center py-2">Duck</th>
                      <th className="text-center py-2">W</th>
                      <th className="text-center py-2">Ov</th>
                      <th className="text-center py-2">RC</th>
                      <th className="text-center py-2">Md</th>
                      <th className="text-center py-2">Ct</th>
                      <th className="text-center py-2">St</th>
                      <th className="text-center py-2">RO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performances.map((p, i) => (
                      <tr key={p.player_id} className={`border-b border-border/50 ${p.is_playing_xi ? '' : 'opacity-40'}`}>
                        <td className="py-1.5 pr-2 font-medium truncate max-w-[120px]">{p.player_name}</td>
                        <td className="text-center py-1.5">
                          <input type="checkbox" checked={p.is_playing_xi} onChange={e => updatePerf(i, 'is_playing_xi', e.target.checked)} className="w-4 h-4 accent-[#ff6b00]" />
                        </td>
                        {(['runs','balls_faced','fours','sixes'] as const).map(f => (
                          <td key={f} className="text-center py-1.5">
                            <input type="number" min={0} value={p[f]} onChange={e => updatePerf(i, f, parseInt(e.target.value) || 0)} disabled={!p.is_playing_xi} className="w-10 text-center bg-input border border-border rounded px-1 text-xs disabled:opacity-30" />
                          </td>
                        ))}
                        <td className="text-center py-1.5">
                          <input type="checkbox" checked={p.is_duck} onChange={e => updatePerf(i, 'is_duck', e.target.checked)} disabled={!p.is_playing_xi} className="w-4 h-4 accent-[#ff6b00] disabled:opacity-30" />
                        </td>
                        {(['wickets','overs_bowled','runs_conceded','maidens','catches','stumpings','run_outs_direct'] as const).map(f => (
                          <td key={f} className="text-center py-1.5">
                            <input type="number" min={0} step={f === 'overs_bowled' ? '0.1' : '1'} value={p[f]} onChange={e => updatePerf(i, f, parseFloat(e.target.value) || 0)} disabled={!p.is_playing_xi} className="w-10 text-center bg-input border border-border rounded px-1 text-xs disabled:opacity-30" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Separator className="bg-border" />

              <div className="flex gap-3">
                <Button
                  onClick={savePerformances}
                  disabled={saving}
                  className="bg-[#ff6b00] hover:bg-[#e55c00] text-white"
                >
                  {saving ? 'Saving…' : 'Save Performances'}
                </Button>
                <Button
                  onClick={handleRecalculate}
                  disabled={recalculating || !selectedLeagueId}
                  variant="outline"
                  className="border-[#00d4aa] text-[#00d4aa] hover:bg-[#00d4aa]/10"
                >
                  {recalculating ? 'Recalculating…' : '⚡ Recalculate Points'}
                </Button>
              </div>
              {!selectedLeagueId && (
                <p className="text-xs text-destructive">Select a league above to recalculate points</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
