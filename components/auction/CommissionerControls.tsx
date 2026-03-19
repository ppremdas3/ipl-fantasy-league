'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { AuctionSession, IplPlayer } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  leagueId: string
  session: AuctionSession | null
  currentPlayer: IplPlayer | null
}

export default function CommissionerControls({ leagueId, session, currentPlayer }: Props) {
  const supabase = createClient()
  const [players, setPlayers] = useState<IplPlayer[]>([])
  const [soldPlayerIds, setSoldPlayerIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('')
  const [filterTeam, setFilterTeam] = useState('')

  useEffect(() => {
    async function loadPlayers() {
      const { data: allPlayers } = await supabase.from('ipl_players').select('*').order('name')
      const { data: sold } = await supabase.from('team_players').select('player_id').eq('league_id', leagueId)
      if (allPlayers) setPlayers(allPlayers)
      if (sold) setSoldPlayerIds(new Set(sold.map(s => s.player_id)))
    }
    loadPlayers()
  }, [supabase, leagueId])

  const teams = [...new Set(players.map(p => p.ipl_team))].sort()
  const availablePlayers = players.filter(p =>
    !soldPlayerIds.has(p.id) &&
    (filterTeam === '' || p.ipl_team === filterTeam)
  )

  async function startPlayer() {
    if (!selectedPlayerId) { toast.error('Select a player first'); return }
    setLoading(true)
    const res = await fetch('/api/auction/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ league_id: leagueId, player_id: selectedPlayerId }),
    })
    const data = await res.json()
    if (!res.ok) toast.error(data.error)
    else { toast.success('Player up for auction!'); setSelectedPlayerId('') }
    setLoading(false)
  }

  async function finalize(markUnsold = false) {
    setLoading(true)
    const res = await fetch('/api/auction/sold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ league_id: leagueId, mark_unsold: markUnsold }),
    })
    const data = await res.json()
    if (!res.ok) toast.error(data.error)
    else {
      toast.success(markUnsold ? 'Player marked as unsold' : `Player sold for ₹${data.price}L!`)
      setSoldPlayerIds(prev => {
        const next = new Set(prev)
        if (data.player_id) next.add(data.player_id)
        return next
      })
    }
    setLoading(false)
  }

  const isActive = session?.status === 'active'

  return (
    <Card className="bg-card border-[#ff6b00]/30 border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-[#ff6b00]">Commissioner Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Finalize buttons (when active) */}
        {isActive && (
          <div className="flex gap-2">
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => finalize(false)}
              disabled={loading || !session?.current_highest_bidder_id}
            >
              🔨 SOLD
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-muted text-muted-foreground hover:border-destructive hover:text-destructive"
              onClick={() => finalize(true)}
              disabled={loading}
            >
              Unsold
            </Button>
          </div>
        )}

        {/* Put next player up */}
        {(!isActive || session?.status === 'sold' || session?.status === 'unsold' || session?.status === 'waiting') && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Put player up for auction</p>
            <div className="flex gap-2">
              <select
                value={filterTeam}
                onChange={e => setFilterTeam(e.target.value)}
                className="bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground"
              >
                <option value="">All teams</option>
                {teams.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <select
              value={selectedPlayerId}
              onChange={e => setSelectedPlayerId(e.target.value)}
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              <option value="">Select player ({availablePlayers.length} available)</option>
              {availablePlayers.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.ipl_team}) — {p.role.replace('_', ' ')} — ₹{p.base_price}L
                </option>
              ))}
            </select>
            <Button
              className="w-full bg-[#ff6b00] hover:bg-[#e55c00] text-white"
              onClick={startPlayer}
              disabled={loading || !selectedPlayerId}
            >
              {loading ? 'Starting…' : '▶ Start Auction'}
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {soldPlayerIds.size} sold · {players.length - soldPlayerIds.size} remaining
        </p>
      </CardContent>
    </Card>
  )
}
