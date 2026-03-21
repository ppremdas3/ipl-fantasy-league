'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import PlayerAvatar from '@/components/ui/PlayerAvatar'

type Player = {
  id: string
  name: string
  ipl_team: string
  role: string
  fantasy_price: number
  is_overseas: boolean
  cricinfo_id?: string | null
}

type MatchPerf = {
  match_number: number
  opponent: string
  fantasy_points: number
  runs: number
  wickets: number
}

type BattingRow = {
  format: string; span: string; matches: string; innings: string
  runs: string; hs: string; avg: string; sr: string
  fifties: string; hundreds: string; fours: string; sixes: string
}

type BowlingRow = {
  format: string; span: string; matches: string; innings: string
  wickets: string; runs: string; economy: string; avg: string
  sr: string; best: string; fiveW: string
}

type Props = {
  player: Player
  leagueId: string
  isSelected: boolean
  isCaptain: boolean
  isViceCaptain: boolean
  onClose: () => void
  onToggle: () => void
  onSetCaptain: () => void
  onSetViceCaptain: () => void
  isPastDeadline: boolean
}

const ROLE_FULL: Record<string, string> = {
  batsman: 'Batsman',
  bowler: 'Bowler',
  all_rounder: 'All-Rounder',
  wicket_keeper: 'Wicket-Keeper',
}

const TEAM_BADGE_COLORS: Record<string, string> = {
  MI: 'bg-blue-500/20 text-blue-300',
  CSK: 'bg-yellow-500/20 text-yellow-300',
  RCB: 'bg-red-500/20 text-red-300',
  KKR: 'bg-purple-500/20 text-purple-300',
  RR: 'bg-pink-500/20 text-pink-300',
  DC: 'bg-sky-500/20 text-sky-300',
  PBKS: 'bg-rose-500/20 text-rose-300',
  SRH: 'bg-orange-500/20 text-orange-300',
  LSG: 'bg-lime-500/20 text-lime-300',
  GT: 'bg-indigo-500/20 text-indigo-300',
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: MatchPerf }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-[#1a1d30] border border-border rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="font-bold text-white mb-1">{d.fantasy_points} pts</p>
      <p className="text-muted-foreground">vs {d.opponent}</p>
      {d.runs > 0 && <p className="text-[#ff6b00]">{d.runs} runs</p>}
      {d.wickets > 0 && <p className="text-[#22c55e]">{d.wickets} wkts</p>}
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-bold text-white font-mono">{value}</p>
    </div>
  )
}

export default function PlayerStatsModal({
  player, leagueId, isSelected, isCaptain, isViceCaptain,
  onClose, onToggle, onSetCaptain, onSetViceCaptain, isPastDeadline
}: Props) {
  const [tab, setTab] = useState<'season' | 'career'>('season')
  const [perfs, setPerfs] = useState<MatchPerf[]>([])
  const [seasonLoading, setSeasonLoading] = useState(true)
  const [batting, setBatting] = useState<BattingRow[]>([])
  const [bowling, setBowling] = useState<BowlingRow[]>([])
  const [careerLoading, setCareerLoading] = useState(false)
  const [careerError, setCareerError] = useState<string | null>(null)

  // Fetch season stats on open
  useEffect(() => {
    setSeasonLoading(true)
    fetch(`/api/players/${player.id}/stats?league_id=${leagueId}`)
      .then(r => r.json())
      .then(data => setPerfs(data.performances ?? []))
      .finally(() => setSeasonLoading(false))
  }, [player.id, leagueId])

  // Fetch career stats when tab switches
  useEffect(() => {
    if (tab !== 'career' || batting.length > 0 || bowling.length > 0) return
    setCareerLoading(true)
    setCareerError(null)
    fetch(`/api/players/${player.id}/cricbuzz-stats`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setCareerError(data.error)
        setBatting(data.batting ?? [])
        setBowling(data.bowling ?? [])
      })
      .catch(() => setCareerError('Failed to load career stats'))
      .finally(() => setCareerLoading(false))
  }, [tab, player.id, batting.length, bowling.length])

  const totalMatches = perfs.length
  const totalRuns = perfs.reduce((s, p) => s + p.runs, 0)
  const totalWickets = perfs.reduce((s, p) => s + p.wickets, 0)
  const totalPts = perfs.reduce((s, p) => s + p.fantasy_points, 0)
  const avgPts = totalMatches > 0 ? (totalPts / totalMatches).toFixed(1) : '—'

  const teamBadge = TEAM_BADGE_COLORS[player.ipl_team] ?? 'bg-muted text-muted-foreground'

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="relative w-full max-w-2xl bg-[#161829] border border-border rounded-2xl overflow-hidden shadow-2xl">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-white transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col sm:flex-row">
          {/* Left: player card */}
          <div className="sm:w-52 bg-gradient-to-b from-[#1e2140] to-[#161829] p-5 flex flex-col gap-4">
            <div className="flex justify-center">
              <PlayerAvatar
                name={player.name}
                iplTeam={player.ipl_team}
                cricinfoId={player.cricinfo_id}
                size="lg"
                className="w-32 h-40"
              />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{player.name}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${teamBadge}`}>
                  {player.ipl_team}
                </span>
                {player.is_overseas && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-[#ff6b00]/20 text-[#ff6b00]">OS</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{ROLE_FULL[player.role]}</p>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price</span>
                <span className="font-mono text-[#ff6b00] font-bold">₹{player.fantasy_price}L</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg pts</span>
                <span className="font-bold text-white">{avgPts}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">League pts</span>
                <span className="font-bold text-[#00d4ff]">{totalPts.toFixed(1)}</span>
              </div>
            </div>
            {/* Action buttons */}
            {!isPastDeadline && (
              <div className="space-y-2 mt-auto">
                <button
                  onClick={() => { onToggle(); onClose() }}
                  className={cn(
                    'w-full py-2 rounded-xl text-sm font-semibold transition-all',
                    isSelected
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'bg-[#ff6b00] text-white hover:bg-[#e55c00]'
                  )}
                >
                  {isSelected ? 'Remove' : `Add  ₹${player.fantasy_price}L`}
                </button>
                {isSelected && (
                  <div className="flex gap-2">
                    <button
                      onClick={onSetCaptain}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg text-xs font-bold transition-all',
                        isCaptain ? 'bg-[#ff6b00] text-white' : 'bg-muted text-muted-foreground hover:bg-[#ff6b00]/20 hover:text-[#ff6b00]'
                      )}
                    >
                      {isCaptain ? 'Captain ✓' : 'Captain (2×)'}
                    </button>
                    <button
                      onClick={onSetViceCaptain}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg text-xs font-bold transition-all',
                        isViceCaptain ? 'bg-[#22c55e] text-white' : 'bg-muted text-muted-foreground hover:bg-[#22c55e]/20 hover:text-[#22c55e]'
                      )}
                    >
                      {isViceCaptain ? 'VC ✓' : 'VC (1.5×)'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: tabs + stats */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Tab bar */}
            <div className="flex border-b border-border">
              {(['season', 'career'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 py-3 text-xs font-semibold tracking-widest uppercase transition-colors',
                    tab === t
                      ? 'text-[#00d4ff] border-b-2 border-[#00d4ff] -mb-px'
                      : 'text-muted-foreground hover:text-white'
                  )}
                >
                  {t === 'season' ? 'This Season' : 'Career (T20)'}
                </button>
              ))}
            </div>

            {/* Season tab */}
            {tab === 'season' && (
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Matches', value: totalMatches },
                    { label: 'Runs', value: totalRuns },
                    { label: 'Wickets', value: totalWickets },
                    { label: 'Total Pts', value: totalPts.toFixed(1) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-muted/40 rounded-xl p-3 text-center">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={cn('text-xl font-black mt-1', label === 'Total Pts' ? 'text-[#00d4ff]' : 'text-white')}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white mb-3">Fantasy Points per Match</h3>
                  {seasonLoading ? (
                    <div className="h-36 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
                  ) : perfs.length === 0 ? (
                    <div className="h-36 flex items-center justify-center text-muted-foreground text-sm">No match data yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={perfs} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                        <XAxis dataKey="opponent" tick={{ fontSize: 10, fill: '#8891b0' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#8891b0' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                        <Bar
                          dataKey="fantasy_points"
                          radius={[4, 4, 0, 0]}
                          fill="#3b82f6"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}

            {/* Career tab */}
            {tab === 'career' && (
              <div className="p-5 space-y-5 overflow-y-auto max-h-[400px]">
                {careerLoading && (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading career stats…</div>
                )}
                {careerError && !careerLoading && (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">{careerError}</div>
                )}

                {/* Batting */}
                {!careerLoading && batting.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold tracking-widest uppercase text-[#ff6b00] mb-3">Batting</p>
                    <div className="space-y-3">
                      {batting.map((r, i) => (
                        <div key={i} className="bg-muted/30 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-white">{r.format}</span>
                            <span className="text-[10px] text-muted-foreground">{r.span}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            <StatCell label="Mat" value={r.matches} />
                            <StatCell label="Runs" value={r.runs} />
                            <StatCell label="Avg" value={r.avg} />
                            <StatCell label="SR" value={r.sr} />
                            <StatCell label="HS" value={r.hs} />
                            <StatCell label="50s" value={r.fifties} />
                            <StatCell label="100s" value={r.hundreds} />
                            <StatCell label="6s" value={r.sixes} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bowling */}
                {!careerLoading && bowling.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold tracking-widest uppercase text-[#22c55e] mb-3">Bowling</p>
                    <div className="space-y-3">
                      {bowling.map((r, i) => (
                        <div key={i} className="bg-muted/30 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-white">{r.format}</span>
                            <span className="text-[10px] text-muted-foreground">{r.span}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            <StatCell label="Mat" value={r.matches} />
                            <StatCell label="Wkts" value={r.wickets} />
                            <StatCell label="Econ" value={r.economy} />
                            <StatCell label="Avg" value={r.avg} />
                            <StatCell label="SR" value={r.sr} />
                            <StatCell label="Best" value={r.best} />
                            <StatCell label="5W" value={r.fiveW} />
                            <StatCell label="Runs" value={r.runs} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!careerLoading && !careerError && batting.length === 0 && bowling.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No T20 career data available</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
