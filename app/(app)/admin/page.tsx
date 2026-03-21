'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient as createTypedClient } from '@/lib/supabase/client'
import { IplMatch, IplPlayer, League } from '@/lib/supabase/types'
import { calculatePoints } from '@/lib/scoring/fantasy-points'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ChevronDown, ChevronRight, FlaskConical, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'

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

interface Gameweek {
  id: string
  week_number: number
  name: string
  start_date: string
  end_date: string
  deadline: string
  status: string
}

interface PlayerBreakdown {
  player_id: string
  name: string
  ipl_team: string
  role: string
  is_captain: boolean
  is_vice_captain: boolean
  raw_pts: number
  multiplier: number
  final_pts: number
  in_match: boolean
}

interface MemberResult {
  member_id: string
  team_name: string
  display_name: string
  current_total: number
  has_selection: boolean
  selection_count: number
  player_breakdown: PlayerBreakdown[]
  match_pts: number
}

interface SyncResult {
  match: { match_number: number; team1: string; team2: string; result: string }
  stats: { players_fetched: number; players_matched: number; players_unmatched: number }
  member_results: { team_name: string; match_pts: number; new_total: number }[]
  unmatched_players: string[]
}

interface SimResult {
  match: { match_number: number; team1: string; team2: string; gameweek_id: string }
  member_results: MemberResult[]
  performances_evaluated: number
}

const ROLE_SHORT: Record<string, string> = {
  batsman: 'BAT',
  bowler: 'BWL',
  all_rounder: 'AR',
  wicket_keeper: 'WK',
}

export default function AdminPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createTypedClient() as any
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [myLeagues, setMyLeagues] = useState<League[]>([])
  const [selectedLeagueId, setSelectedLeagueId] = useState('')
  const [matches, setMatches] = useState<IplMatch[]>([])
  const [gameweeks, setGameweeks] = useState<Gameweek[]>([])
  const [selectedMatchId, setSelectedMatchId] = useState('')
  const [players, setPlayers] = useState<IplPlayer[]>([])
  const [performances, setPerformances] = useState<PerformanceRow[]>([])
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [simResult, setSimResult] = useState<SimResult | null>(null)
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set())
  const [generatingWeeks, setGeneratingWeeks] = useState(false)
  const [addingMatch, setAddingMatch] = useState(false)
  const [seedingSchedule, setSeedingSchedule] = useState(false)
  const [syncMatchId, setSyncMatchId] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  // New match form
  const [newMatch, setNewMatch] = useState({
    match_number: '',
    team1: '',
    team2: '',
    scheduled_at: '',
    venue: '',
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/dashboard'); return }
      const { data } = await supabase.from('leagues').select('*').eq('commissioner_id', user.id)
      const leagues = data ?? []
      if (leagues.length === 0) { router.replace('/dashboard'); return }
      setMyLeagues(leagues)
      setSelectedLeagueId(leagues[0].id)
      setLoading(false)
    }
    load()
  }, [supabase, router])

  useEffect(() => {
    if (!selectedLeagueId) return
    supabase.from('ipl_matches').select('*').order('match_number').then(({ data }: { data: IplMatch[] | null }) => setMatches(data ?? []))
    supabase.from('ipl_players').select('*').order('name').then(({ data }: { data: IplPlayer[] | null }) => setPlayers(data ?? []))
    supabase.from('gameweeks').select('*').order('week_number').then(({ data }: { data: Gameweek[] | null }) => setGameweeks(data ?? []))
  }, [supabase, selectedLeagueId])

  async function seedSchedule() {
    setSeedingSchedule(true)
    const res = await fetch('/api/schedule/seed', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) toast.error(data.error ?? 'Failed to seed schedule')
    else {
      toast.success(data.message)
      supabase.from('ipl_matches').select('*').order('match_number').then(({ data: d }: { data: IplMatch[] | null }) => setMatches(d ?? []))
      supabase.from('gameweeks').select('*').order('week_number').then(({ data: d }: { data: Gameweek[] | null }) => setGameweeks(d ?? []))
    }
    setSeedingSchedule(false)
  }

  async function addMatch() {
    if (!newMatch.match_number || !newMatch.team1 || !newMatch.team2 || !newMatch.scheduled_at) {
      toast.error('Fill in match number, both teams, and date/time')
      return
    }
    setAddingMatch(true)
    const { error } = await supabase.from('ipl_matches').upsert({
      match_number: parseInt(newMatch.match_number),
      team1: newMatch.team1,
      team2: newMatch.team2,
      scheduled_at: new Date(newMatch.scheduled_at).toISOString(),
      venue: newMatch.venue || null,
      status: 'upcoming',
    }, { onConflict: 'match_number' })
    if (error) { toast.error(error.message); setAddingMatch(false); return }
    toast.success(`Match #${newMatch.match_number} added`)
    setNewMatch({ match_number: '', team1: '', team2: '', scheduled_at: '', venue: '' })
    supabase.from('ipl_matches').select('*').order('match_number').then(({ data: d }: { data: IplMatch[] | null }) => setMatches(d ?? []))
    setAddingMatch(false)
  }

  async function generateGameweeks() {
    setGeneratingWeeks(true)
    const res = await fetch('/api/schedule/generate-gameweeks', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) toast.error(data.error ?? 'Failed to generate gameweeks')
    else {
      toast.success(data.message)
      supabase.from('gameweeks').select('*').order('week_number').then(({ data: d }: { data: Gameweek[] | null }) => setGameweeks(d ?? []))
    }
    setGeneratingWeeks(false)
  }

  function initPerformances(playerList: IplPlayer[]) {
    setPerformances(playerList.map(p => ({
      player_id: p.id,
      player_name: p.name,
      runs: 0, balls_faced: 0, fours: 0, sixes: 0, is_duck: false,
      wickets: 0, overs_bowled: 0, runs_conceded: 0, maidens: 0,
      catches: 0, stumpings: 0, run_outs_direct: 0, run_outs_assist: 0,
      is_playing_xi: false,
    })))
    setSimResult(null)
  }

  function updatePerf(index: number, field: keyof PerformanceRow, value: number | boolean) {
    setPerformances(prev => {
      const next = [...prev]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(next[index] as any)[field] = value
      return next
    })
    setSimResult(null) // clear stale sim when data changes
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

  async function handleSimulate() {
    if (!selectedMatchId || !selectedLeagueId) {
      toast.error('Select both a match and a league first')
      return
    }
    const playing = performances.filter(p => p.is_playing_xi)
    if (playing.length === 0) {
      toast.error('Mark at least one player as playing')
      return
    }
    setSimulating(true)
    const res = await fetch('/api/points/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        match_id: selectedMatchId,
        league_id: selectedLeagueId,
        performances: playing,
      }),
    })
    const data = await res.json()
    if (!res.ok) toast.error(data.error)
    else {
      setSimResult(data)
      toast.success('Simulation complete — scroll down to see results')
    }
    setSimulating(false)
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

  function toggleMember(id: string) {
    setExpandedMembers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSyncScorecard() {
    if (!syncMatchId || !selectedLeagueId) {
      toast.error('Select both a match and a league')
      return
    }
    setSyncing(true)
    setSyncResult(null)
    setSyncError(null)
    const res = await fetch('/api/points/sync-scorecard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_id: syncMatchId, league_id: selectedLeagueId }),
    })
    const data = await res.json()
    if (!res.ok) {
      setSyncError(data.error ?? 'Something went wrong')
      toast.error(data.error ?? 'Sync failed')
    } else {
      setSyncResult(data)
      toast.success(`Points synced! ${data.member_results.length} teams updated.`)
      // Refresh matches list so status shows completed
      supabase.from('ipl_matches').select('*').order('match_number').then(({ data: d }: { data: IplMatch[] | null }) => setMatches(d ?? []))
    }
    setSyncing(false)
  }

  const playingCount = performances.filter(p => p.is_playing_xi).length

  if (loading) return null

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-muted-foreground text-sm mt-1">Commissioner tools — schedule, scores, and points</p>
      </div>

      {/* League selector — only shown if commissioner of multiple leagues */}
      {myLeagues.length > 1 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Select League</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              value={selectedLeagueId}
              onChange={e => setSelectedLeagueId(e.target.value)}
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              {myLeagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </CardContent>
        </Card>
      )}

      {/* Manual Match Entry */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Add IPL 2026 Matches</CardTitle>
          <CardDescription>Manually add each match. Once all matches are entered, generate gameweeks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* One-click seed */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
            <div>
              <p className="text-sm font-medium">IPL 2026 — Full Season Schedule</p>
              <p className="text-xs text-muted-foreground mt-0.5">Fetches all matches live from Cricbuzz · 1 API request</p>
            </div>
            <Button onClick={seedSchedule} disabled={seedingSchedule}
              className="bg-[#ff6b00] hover:bg-[#e55c00] text-white shrink-0">
              {seedingSchedule ? 'Loading…' : '⬇ Load Schedule'}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" />
            <span>or add matches manually below</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {/* Entry form */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Match #</Label>
              <Input type="number" placeholder="1" value={newMatch.match_number}
                onChange={e => setNewMatch(p => ({ ...p, match_number: e.target.value }))}
                className="bg-input border-border mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Team 1</Label>
              <select value={newMatch.team1} onChange={e => setNewMatch(p => ({ ...p, team1: e.target.value }))}
                className="w-full mt-1 h-8 rounded-md border border-border bg-input text-sm px-2 text-foreground">
                <option value="">Select</option>
                {['MI','CSK','RCB','KKR','RR','DC','PBKS','SRH','LSG','GT'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Team 2</Label>
              <select value={newMatch.team2} onChange={e => setNewMatch(p => ({ ...p, team2: e.target.value }))}
                className="w-full mt-1 h-8 rounded-md border border-border bg-input text-sm px-2 text-foreground">
                <option value="">Select</option>
                {['MI','CSK','RCB','KKR','RR','DC','PBKS','SRH','LSG','GT'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Date &amp; Time</Label>
              <Input type="datetime-local" value={newMatch.scheduled_at}
                onChange={e => setNewMatch(p => ({ ...p, scheduled_at: e.target.value }))}
                className="bg-input border-border mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Venue (optional)</Label>
              <Input placeholder="Wankhede Stadium" value={newMatch.venue}
                onChange={e => setNewMatch(p => ({ ...p, venue: e.target.value }))}
                className="bg-input border-border mt-1 h-8 text-sm" />
            </div>
          </div>
          <Button onClick={addMatch} disabled={addingMatch} className="bg-[#ff6b00] hover:bg-[#e55c00] text-white">
            {addingMatch ? 'Adding…' : '+ Add Match'}
          </Button>

          {/* Matches list */}
          {matches.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{matches.length} matches added</p>
                <Button onClick={generateGameweeks} disabled={generatingWeeks} size="sm"
                  className="bg-[#22c55e] hover:bg-[#16a34a] text-white text-xs h-7">
                  {generatingWeeks ? 'Generating…' : '⚡ Generate Gameweeks'}
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {matches.map(m => (
                  <div key={m.id} className="flex items-center justify-between text-xs bg-muted/30 rounded px-3 py-1.5">
                    <span className="text-muted-foreground w-12">M#{m.match_number}</span>
                    <span className="font-medium flex-1">{m.team1} vs {m.team2}</span>
                    <span className="text-muted-foreground">
                      {m.scheduled_at ? new Date(m.scheduled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gameweeks */}
          {gameweeks.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">{gameweeks.length} gameweeks generated</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {gameweeks.map(gw => (
                  <div key={gw.id} className="text-xs bg-muted/30 rounded p-2">
                    <p className="font-semibold">{gw.name}</p>
                    <p className="text-muted-foreground">{gw.start_date} – {gw.end_date}</p>
                    <p className={`mt-0.5 ${gw.status === 'active' ? 'text-[#22c55e]' : 'text-muted-foreground'}`}>{gw.status}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-sync points from Cricbuzz */}
      {selectedLeagueId && matches.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-[#00d4ff]" />
              Sync Match Points from Cricbuzz
            </CardTitle>
            <CardDescription>
              Points sync automatically at 8 PM and midnight IST after each match. Use this to manually trigger a sync if the auto-update hasn&apos;t run yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3 flex-wrap items-end">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">Select match</Label>
                <select
                  value={syncMatchId}
                  onChange={e => { setSyncMatchId(e.target.value); setSyncResult(null); setSyncError(null) }}
                  className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Choose a match…</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {matches.filter((m: any) => m.cricbuzz_match_id).map((m: any) => (
                    <option key={m.id} value={m.id}>
                      M#{m.match_number}: {m.team1} vs {m.team2}
                      {m.status === 'completed' ? ' ✓' : m.status === 'live' ? ' ● LIVE' : ''}
                    </option>
                  ))}
                </select>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {matches.filter((m: any) => !m.cricbuzz_match_id).length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {matches.filter((m: any) => !m.cricbuzz_match_id).length} matches hidden (no Cricbuzz ID — run &quot;Load Schedule&quot; first)
                  </p>
                )}
              </div>
              <Button
                onClick={handleSyncScorecard}
                disabled={syncing || !syncMatchId || !selectedLeagueId}
                className="bg-[#00d4ff] hover:bg-[#00b8db] text-[#060d1f] font-semibold gap-2 shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Fetching scorecard…' : 'Manual Sync'}
              </Button>
            </div>

            {/* Error */}
            {syncError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{syncError}</p>
              </div>
            )}

            {/* Success result */}
            {syncResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-[#22c55e]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">
                    M#{syncResult.match.match_number}: {syncResult.match.team1} vs {syncResult.match.team2}
                  </span>
                  <span className="text-muted-foreground text-xs">— {syncResult.match.result}</span>
                </div>

                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{syncResult.stats.players_matched} players matched</span>
                  {syncResult.stats.players_unmatched > 0 && (
                    <span className="text-yellow-500">{syncResult.stats.players_unmatched} unmatched</span>
                  )}
                  <span>{syncResult.member_results.length} teams updated</span>
                </div>

                {/* Member points table */}
                {syncResult.member_results.length > 0 && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border text-muted-foreground">
                          <th className="text-left px-4 py-2">Team</th>
                          <th className="text-right px-4 py-2">This match</th>
                          <th className="text-right px-4 py-2">New total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syncResult.member_results.map((r, i) => (
                          <tr key={i} className="border-b border-border/50 last:border-0">
                            <td className="px-4 py-2 font-medium">{r.team_name}</td>
                            <td className="px-4 py-2 text-right font-mono font-bold"
                              style={{ color: r.match_pts >= 0 ? '#00d4ff' : '#ef4444' }}>
                              {r.match_pts >= 0 ? '+' : ''}{r.match_pts}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-muted-foreground">{r.new_total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Unmatched players warning */}
                {syncResult.unmatched_players.length > 0 && (
                  <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <p className="text-xs font-medium text-yellow-500 mb-1">
                      {syncResult.unmatched_players.length} players not found in DB (points not counted):
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {syncResult.unmatched_players.join(', ')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Run <code className="bg-muted px-1 rounded">npm run sync-players</code> to add them.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Score entry */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Enter Match Performances</CardTitle>
          <CardDescription>Select a completed match, mark players, fill stats, then preview or save points.</CardDescription>
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
                <span className="ml-2 text-[#00d4ff]/60">Pts column updates live as you type.</span>
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
                      <th className="text-center py-2 text-[#00d4ff]">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performances.map((p, i) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const livePts = p.is_playing_xi ? calculatePoints(p as any) : null
                      return (
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
                          <td className="text-center py-1.5 font-mono font-bold">
                            {livePts !== null ? (
                              <span style={{ color: livePts >= 0 ? '#00d4ff' : '#ef4444' }}>
                                {livePts > 0 ? '+' : ''}{livePts}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <Separator className="bg-border" />

              <div className="flex flex-wrap gap-3">
                <Button onClick={savePerformances} disabled={saving} className="bg-[#ff6b00] hover:bg-[#e55c00] text-white">
                  {saving ? 'Saving…' : 'Save Performances'}
                </Button>
                <Button
                  onClick={handleSimulate}
                  disabled={simulating || !selectedLeagueId}
                  className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white gap-1.5"
                >
                  <FlaskConical className="w-4 h-4" />
                  {simulating ? 'Simulating…' : 'Preview Match Points'}
                </Button>
                <Button
                  onClick={handleRecalculate}
                  disabled={recalculating || !selectedLeagueId}
                  variant="outline"
                  className="border-[#00d4aa] text-[#00d4aa] hover:bg-[#00d4aa]/10"
                >
                  {recalculating ? 'Recalculating…' : '⚡ Commit Points to Leaderboard'}
                </Button>
              </div>
              {!selectedLeagueId && (
                <p className="text-xs text-destructive">Select a league above to preview or commit points</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Simulation Results */}
      {simResult && (
        <Card className="bg-card border-[#8B5CF6]/40" style={{ boxShadow: '0 0 20px rgba(139,92,246,0.1)' }}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-[#8B5CF6]" />
              <CardTitle className="text-base text-[#8B5CF6]">Simulation Preview</CardTitle>
            </div>
            <CardDescription>
              Match #{simResult.match.match_number}: {simResult.match.team1} vs {simResult.match.team2}
              {' · '}{simResult.performances_evaluated} players evaluated
              {' · '}<span className="text-yellow-500">Not saved — click &quot;Commit Points&quot; to apply</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {simResult.member_results.map((m, rank) => (
              <div key={m.member_id} className="rounded-lg border border-border overflow-hidden">
                {/* Member header row */}
                <button
                  onClick={() => toggleMember(m.member_id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5">#{rank + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-white">{m.team_name}</p>
                      {m.display_name && <p className="text-xs text-muted-foreground">{m.display_name}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {m.has_selection ? (
                      <>
                        <div className="text-right">
                          <p className="text-lg font-bold font-mono" style={{ color: '#8B5CF6' }}>
                            +{m.match_pts.toFixed(1)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">this match</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-mono text-muted-foreground">
                            {(m.current_total + m.match_pts).toFixed(1)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">new total</p>
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No selection for this GW</span>
                    )}
                    {m.has_selection && (
                      expandedMembers.has(m.member_id)
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Player breakdown */}
                {expandedMembers.has(m.member_id) && m.has_selection && (
                  <div className="border-t border-border bg-muted/10">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border/50">
                          <th className="text-left px-4 py-2">Player</th>
                          <th className="text-center py-2">Role</th>
                          <th className="text-center py-2">Cap</th>
                          <th className="text-right py-2">Raw pts</th>
                          <th className="text-center py-2">×</th>
                          <th className="text-right px-4 py-2">Final</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.player_breakdown.map(pb => (
                          <tr key={pb.player_id} className={`border-b border-border/30 ${!pb.in_match ? 'opacity-40' : ''}`}>
                            <td className="px-4 py-2">
                              <span className="font-medium text-white">{pb.name}</span>
                              {!pb.in_match && <span className="ml-1 text-muted-foreground">(not in match)</span>}
                            </td>
                            <td className="text-center py-2 text-muted-foreground">{ROLE_SHORT[pb.role] ?? pb.role}</td>
                            <td className="text-center py-2">
                              {pb.is_captain && <span className="px-1 rounded text-[10px] font-bold" style={{ background: '#ff6b00', color: '#fff' }}>C</span>}
                              {pb.is_vice_captain && <span className="px-1 rounded text-[10px] font-bold" style={{ background: '#00d4ff', color: '#060d1f' }}>V</span>}
                              {!pb.is_captain && !pb.is_vice_captain && <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="text-right py-2 font-mono">{pb.raw_pts}</td>
                            <td className="text-center py-2 text-muted-foreground">{pb.multiplier}×</td>
                            <td className="text-right px-4 py-2 font-mono font-bold" style={{ color: pb.final_pts >= 0 ? '#00d4ff' : '#ef4444' }}>
                              {pb.final_pts.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-[#8B5CF6]/30 bg-[#8B5CF6]/5">
                          <td colSpan={5} className="px-4 py-2 text-right font-semibold text-sm text-[#8B5CF6]">Total this match</td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-[#8B5CF6]">{m.match_pts.toFixed(1)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
