'use client'

import PlayerAvatar from '@/components/ui/PlayerAvatar'

const ROLE_ORDER = ['wicket_keeper', 'batsman', 'all_rounder', 'bowler']
const ROLE_LABELS: Record<string, string> = {
  wicket_keeper: 'Wicket Keeper',
  batsman: 'Batsmen',
  all_rounder: 'All-Rounders',
  bowler: 'Bowlers',
}

type Player = {
  id: string
  name: string
  ipl_team: string
  role: string
  fantasy_price: number
  is_overseas: boolean
  cricinfo_id?: string | null
}

type SelectionInfo = {
  player_id: string
  is_captain: boolean
  is_vice_captain: boolean
}

type Props = {
  players: Player[]
  selections: SelectionInfo[]
}

export default function PlayerCardsView({ players, selections }: Props) {
  // Group selected players by role
  const byRole: Record<string, { player: Player; sel: SelectionInfo }[]> = {
    wicket_keeper: [],
    batsman: [],
    all_rounder: [],
    bowler: [],
  }

  for (const sel of selections) {
    const player = players.find(p => p.id === sel.player_id)
    if (player && byRole[player.role]) {
      byRole[player.role].push({ player, sel })
    }
  }

  const rows = ROLE_ORDER
    .map(role => ({ role, entries: byRole[role] }))
    .filter(r => r.entries.length > 0)

  return (
    <div className="space-y-6">
      {rows.map(({ role, entries }) => (
        <div key={role}>
          {/* Role label */}
          <p className="font-rajdhani text-[10px] font-700 tracking-[0.2em] uppercase text-center mb-3"
            style={{ color: 'rgba(0, 212, 255, 0.5)' }}>
            {ROLE_LABELS[role]}
          </p>
          {/* Cards row */}
          <div className="flex flex-wrap justify-center gap-3">
            {entries.map(({ player, sel }) => (
              <PlayerCard key={player.id} player={player} sel={sel} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function PlayerCard({ player, sel }: { player: Player; sel: SelectionInfo }) {
  // Display last name (or full if single word)
  const nameParts = player.name.split(' ')
  const displayName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : player.name

  const isCaptain = sel.is_captain
  const isVC = sel.is_vice_captain

  return (
    <div
      className={`player-card ${isCaptain ? 'player-card-captain' : isVC ? 'player-card-vc' : ''}`}
      style={{ width: 110, minHeight: 170 }}
    >
      {/* Captain / VC badge */}
      {(isCaptain || isVC) && (
        <div
          className="absolute top-2 left-2 z-20 w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-black font-orbitron shadow-lg"
          style={{
            background: isCaptain ? '#ff6b00' : '#00d4ff',
            color: isCaptain ? '#fff' : '#060d1f',
            boxShadow: isCaptain
              ? '0 0 10px rgba(255,107,0,0.7)'
              : '0 0 10px rgba(0,212,255,0.7)',
          }}
        >
          {isCaptain ? 'C' : 'V'}
        </div>
      )}

      {/* Overseas badge */}
      {player.is_overseas && (
        <div className="absolute top-2 right-2 z-20 px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider"
          style={{ background: 'rgba(168,85,247,0.9)', color: '#fff' }}>
          OS
        </div>
      )}

      {/* Player photo */}
      <div className="relative w-full" style={{ height: 110 }}>
        <PlayerAvatar
          name={player.name}
          iplTeam={player.ipl_team}
          cricinfoId={player.cricinfo_id}
          size="lg"
          className="w-full rounded-none"
        />
        {/* gradient fade into card */}
        <div className="absolute inset-0 player-card-gradient pointer-events-none" />
      </div>

      {/* Info section */}
      <div className="px-2 pb-2.5 pt-1">
        {/* Name */}
        <p className="font-orbitron text-[10px] font-800 uppercase tracking-wider text-white leading-tight truncate text-center">
          {displayName.length > 10 ? displayName.slice(0, 10) : displayName}
        </p>
        {/* Team */}
        <p className="font-rajdhani text-[9px] font-600 tracking-widest uppercase text-center mt-0.5"
          style={{ color: 'rgba(0, 212, 255, 0.55)' }}>
          {player.ipl_team}
        </p>
        {/* Price */}
        <p className="font-rajdhani text-[10px] font-700 text-center mt-1"
          style={{ color: '#00d4ff' }}>
          ₹{player.fantasy_price}L
        </p>
      </div>
    </div>
  )
}
