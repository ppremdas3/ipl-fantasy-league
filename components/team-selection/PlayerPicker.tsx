'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Search, X, ChevronDown } from 'lucide-react'
import PlayerAvatar from '@/components/ui/PlayerAvatar'
import PlayerStatsModal from '@/components/team-selection/PlayerStatsModal'

const BUDGET = 10000
const SQUAD_SIZE = 11

const ROLE_LABELS: Record<string, string> = {
  batsman: 'Batsmen',
  bowler: 'Bowlers',
  all_rounder: 'All-Rounders',
  wicket_keeper: 'Wicket Keepers',
}

const ROLE_LIMITS = {
  wicket_keeper: { min: 1, max: 4 },
  batsman: { min: 3, max: 6 },
  all_rounder: { min: 1, max: 4 },
  bowler: { min: 3, max: 6 },
}

const IPL_TEAMS = ['MI', 'CSK', 'RCB', 'KKR', 'RR', 'DC', 'PBKS', 'SRH', 'LSG', 'GT']

const TEAM_BADGE_COLORS: Record<string, string> = {
  MI:   'bg-blue-500/20 text-blue-300 border-blue-500/30',
  CSK:  'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  RCB:  'bg-red-500/20 text-red-300 border-red-500/30',
  KKR:  'bg-purple-500/20 text-purple-300 border-purple-500/30',
  RR:   'bg-pink-500/20 text-pink-300 border-pink-500/30',
  DC:   'bg-sky-500/20 text-sky-300 border-sky-500/30',
  PBKS: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  SRH:  'bg-orange-500/20 text-orange-300 border-orange-500/30',
  LSG:  'bg-lime-500/20 text-lime-300 border-lime-500/30',
  GT:   'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
}

const ROLE_ORDER = ['wicket_keeper', 'batsman', 'all_rounder', 'bowler']

type Player = {
  id: string
  name: string
  ipl_team: string
  role: string
  fantasy_price: number
  is_overseas: boolean
  cricinfo_id?: string | null
}

type SelectedPlayer = {
  player_id: string
  is_captain: boolean
  is_vice_captain: boolean
}

type Props = {
  players: Player[]
  leagueId: string
  gameweekId: string
  gameweekName: string
  deadline: string
  existingSelection: SelectedPlayer[]
}

export default function PlayerPicker({ players, leagueId, gameweekId, gameweekName, deadline, existingSelection }: Props) {
  const [selected, setSelected] = useState<SelectedPlayer[]>(existingSelection)
  const [search, setSearch] = useState('')
  const [filterTeam, setFilterTeam] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [statsPlayer, setStatsPlayer] = useState<Player | null>(null)

  const isPastDeadline = new Date(deadline) < new Date()
  const selectedIds = new Set(selected.map(s => s.player_id))

  const totalCost = selected.reduce((sum, s) => {
    const p = players.find(pl => pl.id === s.player_id)
    return sum + (p?.fantasy_price ?? 0)
  }, 0)
  const remaining = BUDGET - totalCost
  const captain = selected.find(s => s.is_captain)
  const vc = selected.find(s => s.is_vice_captain)

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { batsman: 0, bowler: 0, all_rounder: 0, wicket_keeper: 0 }
    for (const s of selected) {
      const p = players.find(pl => pl.id === s.player_id)
      if (p) counts[p.role] = (counts[p.role] ?? 0) + 1
    }
    return counts
  }, [selected, players])

  const teamCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of selected) {
      const p = players.find(pl => pl.id === s.player_id)
      if (p) counts[p.ipl_team] = (counts[p.ipl_team] ?? 0) + 1
    }
    return counts
  }, [selected, players])

  const filtered = useMemo(() => players.filter(p => {
    if (filterTeam && p.ipl_team !== filterTeam) return false
    if (filterRole && p.role !== filterRole) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [players, filterTeam, filterRole, search])

  // Group selected players by role for left panel
  const selectedByRole = useMemo(() => {
    const groups: Record<string, Player[]> = { wicket_keeper: [], batsman: [], all_rounder: [], bowler: [] }
    for (const s of selected) {
      const p = players.find(pl => pl.id === s.player_id)
      if (p && groups[p.role]) groups[p.role].push(p)
    }
    return groups
  }, [selected, players])

  function togglePlayer(player: Player) {
    if (isPastDeadline) return
    if (selectedIds.has(player.id)) {
      setSelected(prev => prev.filter(s => s.player_id !== player.id))
    } else {
      if (selected.length >= SQUAD_SIZE) { toast.error(`Squad full — max ${SQUAD_SIZE} players`); return }
      if (remaining < player.fantasy_price) { toast.error(`Over budget by ₹${player.fantasy_price - remaining}L`); return }
      if ((teamCounts[player.ipl_team] ?? 0) >= 4) { toast.error(`Max 4 from ${player.ipl_team}`); return }
      const lim = ROLE_LIMITS[player.role as keyof typeof ROLE_LIMITS]
      if (lim && (roleCounts[player.role] ?? 0) >= lim.max) {
        toast.error(`Max ${lim.max} ${ROLE_LABELS[player.role]}`)
        return
      }
      setSelected(prev => [...prev, { player_id: player.id, is_captain: false, is_vice_captain: false }])
    }
  }

  function setCaptain(playerId: string) {
    if (isPastDeadline) return
    setSelected(prev => prev.map(s => ({
      ...s,
      is_captain: s.player_id === playerId,
      is_vice_captain: s.player_id === playerId ? false : s.is_vice_captain,
    })))
  }

  function setViceCaptain(playerId: string) {
    if (isPastDeadline) return
    setSelected(prev => prev.map(s => ({
      ...s,
      is_vice_captain: s.player_id === playerId,
      is_captain: s.player_id === playerId ? false : s.is_captain,
    })))
  }

  async function handleSave() {
    if (selected.length !== SQUAD_SIZE) { toast.error(`Select ${SQUAD_SIZE} players (${selected.length}/11)`); return }
    if (!captain) { toast.error('Choose a captain (C)'); return }
    if (!vc) { toast.error('Choose a vice-captain (VC)'); return }

    setSaving(true)
    const res = await fetch('/api/teams/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ league_id: leagueId, gameweek_id: gameweekId, players: selected }),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) toast.success(`Team saved for ${gameweekName}!`)
    else toast.error(data.error ?? 'Failed to save team')
  }

  const canSave = selected.length === SQUAD_SIZE && !!captain && !!vc && !isPastDeadline

  return (
    <>
      {/* Team filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setFilterTeam('')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border whitespace-nowrap transition-all shrink-0',
            !filterTeam
              ? 'bg-[#ff6b00] border-[#ff6b00] text-white'
              : 'bg-card border-border text-muted-foreground hover:border-[#ff6b00]/40 hover:text-white'
          )}
        >
          All Teams
        </button>
        {IPL_TEAMS.map(team => (
          <button
            key={team}
            onClick={() => setFilterTeam(team === filterTeam ? '' : team)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border whitespace-nowrap transition-all shrink-0',
              filterTeam === team
                ? 'bg-[#ff6b00] border-[#ff6b00] text-white'
                : 'bg-card border-border text-muted-foreground hover:border-[#ff6b00]/40 hover:text-white'
            )}
          >
            {team}
          </button>
        ))}
      </div>

      {/* Main layout */}
      <div className="grid lg:grid-cols-[1fr_380px] gap-4 pb-24">
        {/* Left: selected team grouped by role */}
        <div className="space-y-6">
          {ROLE_ORDER.map(role => {
            const rolePlayers = selectedByRole[role] ?? []
            const lim = ROLE_LIMITS[role as keyof typeof ROLE_LIMITS]
            const slotCount = lim.max
            const slots = Array.from({ length: slotCount })

            return (
              <div key={role}>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {ROLE_LABELS[role]}
                  <span className="ml-2 text-xs normal-case">
                    ({rolePlayers.length}/{lim.min}–{lim.max})
                  </span>
                </h3>
                <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {slots.map((_, i) => {
                    const player = rolePlayers[i]
                    const sel = player ? selected.find(s => s.player_id === player.id) : null

                    if (!player) {
                      return (
                        <div key={i} className="flex flex-col items-center gap-2">
                          <div className="w-16 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center text-muted-foreground/40 text-2xl">
                            +
                          </div>
                          <p className="text-xs text-muted-foreground/50 text-center">
                            {ROLE_LABELS[role].slice(0, -1)}
                          </p>
                        </div>
                      )
                    }

                    return (
                      <div key={player.id} className="flex flex-col items-center gap-1.5">
                        {/* Photo card */}
                        <div className="relative group">
                          <div
                            className={cn(
                              'relative w-16 h-20 rounded-xl overflow-hidden cursor-pointer border-2 transition-all',
                              sel?.is_captain ? 'border-[#ff6b00] ring-2 ring-[#ff6b00]/30' :
                              sel?.is_vice_captain ? 'border-[#22c55e] ring-2 ring-[#22c55e]/30' :
                              'border-border hover:border-white/30'
                            )}
                            onClick={() => !isPastDeadline && setStatsPlayer(player)}
                          >
                            <PlayerAvatar
                              name={player.name}
                              iplTeam={player.ipl_team}
                              cricinfoId={player.cricinfo_id}
                              size="lg"
                              className="w-full h-full"
                            />
                            {/* Gradient overlay */}
                            <div className="absolute inset-0 player-card-gradient" />
                            {/* Captain/VC badge */}
                            {sel?.is_captain && (
                              <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-[#ff6b00] flex items-center justify-center text-white text-xs font-black">C</div>
                            )}
                            {sel?.is_vice_captain && (
                              <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-[#22c55e] flex items-center justify-center text-white text-xs font-black">V</div>
                            )}
                            {/* Remove button */}
                            {!isPastDeadline && (
                              <button
                                onClick={(e) => { e.stopPropagation(); togglePlayer(player) }}
                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              >
                                <X className="w-3 h-3 text-white" />
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Name + C/V buttons */}
                        <div className="text-center w-16">
                          <p className="text-xs font-medium text-white leading-tight truncate">{player.name.split(' ').at(-1)}</p>
                          <p className="text-xs text-[#ff6b00] font-mono">₹{player.fantasy_price}L</p>
                          {!isPastDeadline && (
                            <div className="flex gap-1 justify-center mt-1">
                              <button
                                onClick={() => setCaptain(player.id)}
                                className={cn(
                                  'text-xs w-6 h-5 rounded font-bold transition-all',
                                  sel?.is_captain ? 'bg-[#ff6b00] text-white' : 'bg-muted text-muted-foreground hover:bg-[#ff6b00]/20 hover:text-[#ff6b00]'
                                )}
                              >C</button>
                              <button
                                onClick={() => setViceCaptain(player.id)}
                                className={cn(
                                  'text-xs w-6 h-5 rounded font-bold transition-all',
                                  sel?.is_vice_captain ? 'bg-[#22c55e] text-white' : 'bg-muted text-muted-foreground hover:bg-[#22c55e]/20 hover:text-[#22c55e]'
                                )}
                              >V</button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Right: search + player list */}
        <div className="lg:sticky lg:top-20 self-start">
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-white mb-3">Add Players</h3>
              {/* Filters row */}
              <div className="flex gap-2">
                {/* Role filter */}
                <div className="relative flex-1">
                  <select
                    value={filterRole}
                    onChange={e => setFilterRole(e.target.value)}
                    className="w-full h-9 rounded-lg bg-muted border border-border text-sm px-3 pr-7 text-foreground appearance-none cursor-pointer"
                  >
                    <option value="">All roles</option>
                    <option value="wicket_keeper">WK</option>
                    <option value="batsman">BAT</option>
                    <option value="all_rounder">AR</option>
                    <option value="bowler">BOWL</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full h-9 rounded-lg bg-muted border border-border text-sm pl-8 pr-3 text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-[#ff6b00]/40"
                  />
                </div>
              </div>
            </div>

            {/* Column headers */}
            <div className="px-4 py-2 grid grid-cols-[1fr_auto_auto] gap-2 text-xs text-muted-foreground border-b border-border/50">
              <span>Player</span>
              <span>Team</span>
              <span>Price</span>
            </div>

            {/* Player list */}
            <div className="overflow-y-auto max-h-[calc(100vh-320px)]">
              {filtered.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">No players found</p>
              )}
              {filtered.map(player => {
                const isSelected = selectedIds.has(player.id)
                const sel = selected.find(s => s.player_id === player.id)
                const teamBadge = TEAM_BADGE_COLORS[player.ipl_team] ?? 'bg-muted text-muted-foreground border-border'
                const disabled = !isSelected && (
                  selected.length >= SQUAD_SIZE ||
                  remaining < player.fantasy_price ||
                  (teamCounts[player.ipl_team] ?? 0) >= 4 ||
                  (ROLE_LIMITS[player.role as keyof typeof ROLE_LIMITS]?.max ?? 99) <= (roleCounts[player.role] ?? 0)
                )

                return (
                  <div
                    key={player.id}
                    className={cn(
                      'px-4 py-3 grid grid-cols-[1fr_auto_auto] gap-2 items-center border-b border-border/30 transition-colors',
                      isSelected ? 'bg-[#ff6b00]/8' : disabled ? 'opacity-40' : 'hover:bg-white/3'
                    )}
                  >
                    {/* Player info */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="shrink-0">
                        <PlayerAvatar
                          name={player.name}
                          iplTeam={player.ipl_team}
                          cricinfoId={player.cricinfo_id}
                          size="sm"
                        />
                      </div>
                      <div className="min-w-0">
                        <button
                          onClick={() => setStatsPlayer(player)}
                          className="text-sm font-medium text-white hover:text-[#ff6b00] transition-colors truncate block text-left"
                        >
                          {player.name}
                        </button>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {player.role === 'wicket_keeper' ? 'WK' : player.role === 'all_rounder' ? 'AR' : player.role === 'batsman' ? 'BAT' : 'BOWL'}
                          </span>
                          {player.is_overseas && <span className="text-xs text-[#ff6b00]">· OS</span>}
                          {sel?.is_captain && <span className="text-xs text-[#ff6b00] font-bold">· C</span>}
                          {sel?.is_vice_captain && <span className="text-xs text-[#22c55e] font-bold">· VC</span>}
                        </div>
                      </div>
                    </div>

                    {/* Team badge */}
                    <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${teamBadge}`}>
                      {player.ipl_team}
                    </span>

                    {/* Price + add button */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-white/80 tabular-nums w-16 text-right">
                        ₹{player.fantasy_price}L
                      </span>
                      <button
                        onClick={() => togglePlayer(player)}
                        disabled={isPastDeadline || (disabled && !isSelected)}
                        className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold transition-all shrink-0',
                          isSelected
                            ? 'bg-[#ff6b00] text-white hover:bg-red-500'
                            : disabled
                            ? 'bg-muted text-muted-foreground cursor-not-allowed'
                            : 'bg-[#ff6b00] text-white hover:bg-[#e55c00]'
                        )}
                      >
                        {isSelected ? <X className="w-3.5 h-3.5" /> : '+'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom fixed bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-white/8">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Players</p>
              <p className="text-lg font-black text-white tabular-nums">
                {selected.length}<span className="text-muted-foreground font-normal text-sm">/{SQUAD_SIZE}</span>
              </p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div>
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className={cn('text-lg font-black tabular-nums', remaining < 0 ? 'text-red-400' : 'text-white')}>
                ₹{remaining.toLocaleString('en-IN')}<span className="text-muted-foreground font-normal text-sm">L</span>
              </p>
            </div>
            {(!captain || !vc) && selected.length > 0 && (
              <>
                <div className="w-px h-8 bg-border" />
                <p className="text-xs text-amber-400">
                  {!captain && !vc ? 'Set C & VC' : !captain ? 'Set Captain' : 'Set Vice-Captain'}
                </p>
              </>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className={cn(
              'px-6 py-2.5 rounded-xl font-semibold text-sm transition-all',
              canSave
                ? 'bg-[#ff6b00] hover:bg-[#e55c00] text-white glow-orange'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {saving ? 'Saving…' : isPastDeadline ? 'Deadline Passed' : 'Save Team'}
          </button>
        </div>
      </div>

      {/* Player stats modal */}
      {statsPlayer && (
        <PlayerStatsModal
          player={statsPlayer}
          isSelected={selectedIds.has(statsPlayer.id)}
          isCaptain={selected.find(s => s.player_id === statsPlayer.id)?.is_captain ?? false}
          isViceCaptain={selected.find(s => s.player_id === statsPlayer.id)?.is_vice_captain ?? false}
          onClose={() => setStatsPlayer(null)}
          onToggle={() => togglePlayer(statsPlayer)}
          onSetCaptain={() => setCaptain(statsPlayer.id)}
          onSetViceCaptain={() => setViceCaptain(statsPlayer.id)}
          isPastDeadline={isPastDeadline}
        />
      )}
    </>
  )
}
