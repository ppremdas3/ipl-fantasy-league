'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
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

type Props = {
  player: Player
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

// Custom tooltip for the bar chart
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

export default function PlayerStatsModal({
  player, isSelected, isCaptain, isViceCaptain,
  onClose, onToggle, onSetCaptain, onSetViceCaptain, isPastDeadline
}: Props) {
  const [perfs, setPerfs] = useState<MatchPerf[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch(`/api/players/${player.id}/stats`)
      if (res.ok) {
        const data = await res.json()
        setPerfs(data.performances ?? [])
      }
      setLoading(false)
    }
    load()
  }, [player.id])

  // Summary stats from perfs
  const totalMatches = perfs.length
  const totalRuns = perfs.reduce((s, p) => s + p.runs, 0)
  const totalWickets = perfs.reduce((s, p) => s + p.wickets, 0)
  const avgPts = totalMatches > 0
    ? (perfs.reduce((s, p) => s + p.fantasy_points, 0) / totalMatches).toFixed(1)
    : '—'

  const teamBadge = TEAM_BADGE_COLORS[player.ipl_team] ?? 'bg-muted text-muted-foreground'

  // Close on backdrop click
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

          {/* Right: stats + chart */}
          <div className="flex-1 p-5 space-y-5">
            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Matches', value: totalMatches },
                { label: 'Runs', value: totalRuns },
                { label: 'Wickets', value: totalWickets },
              ].map(({ label, value }) => (
                <div key={label} className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-black text-white mt-1">{value}</p>
                </div>
              ))}
            </div>

            {/* Performance chart */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Fantasy Points per Match</h3>
              </div>
              {loading ? (
                <div className="h-36 flex items-center justify-center text-muted-foreground text-sm">
                  Loading…
                </div>
              ) : perfs.length === 0 ? (
                <div className="h-36 flex items-center justify-center text-muted-foreground text-sm">
                  No match data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={perfs} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <XAxis
                      dataKey="opponent"
                      tick={{ fontSize: 10, fill: '#8891b0' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#8891b0' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="fantasy_points" radius={[4, 4, 0, 0]}>
                      {perfs.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.fantasy_points >= 50 ? '#22c55e' : '#3b82f6'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
