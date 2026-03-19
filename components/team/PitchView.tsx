'use client'

import PlayerAvatar from '@/components/ui/PlayerAvatar'

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

type SelectionInfo = {
  player_id: string
  is_captain: boolean
  is_vice_captain: boolean
}

type Props = {
  players: Player[]
  selections: SelectionInfo[]
}

export default function PitchView({ players, selections }: Props) {
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

  const rows = ROLE_ORDER.map(role => byRole[role]).filter(r => r.length > 0)

  return (
    <div className="relative w-full max-w-xl mx-auto select-none" style={{ aspectRatio: '1 / 1.1' }}>

      {/* ── Pitch background ── */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Outer field */}
        <div className="absolute inset-0 rounded-[50%] overflow-hidden"
          style={{ background: 'radial-gradient(ellipse at 40% 35%, #3a7d1e 0%, #2d6018 40%, #1e4510 100%)', boxShadow: '0 24px 80px rgba(0,0,0,0.7), inset 0 0 0 6px rgba(0,0,0,0.25)' }}
        />
        {/* 30-yard circle */}
        <div className="absolute rounded-[50%] border border-white/10"
          style={{ inset: '18%', background: 'radial-gradient(ellipse, #3f8a20 0%, #357318 100%)' }}
        />
        {/* Pitch strip */}
        <div className="absolute"
          style={{
            left: '44%', right: '44%',
            top: '16%', bottom: '16%',
            background: 'linear-gradient(180deg, #b8935a 0%, #a07848 50%, #b8935a 100%)',
            borderRadius: '6px',
            boxShadow: 'inset 0 0 12px rgba(0,0,0,0.3)',
          }}
        >
          {/* Crease lines */}
          <div className="absolute inset-x-0 h-0.5 bg-white/50" style={{ top: '22%' }} />
          <div className="absolute inset-x-0 h-0.5 bg-white/50" style={{ bottom: '22%' }} />
          {/* Stumps suggestion */}
          <div className="absolute inset-x-1 h-px bg-white/20" style={{ top: '21%' }} />
          <div className="absolute inset-x-1 h-px bg-white/20" style={{ bottom: '21%' }} />
        </div>
        {/* Boundary ring (dashed) */}
        <div className="absolute rounded-[50%] border border-dashed border-white/8" style={{ inset: '3%' }} />
      </div>

      {/* ── Players ── */}
      <div className="absolute inset-0 flex flex-col justify-evenly py-4 px-2">
        {rows.map((rowPlayers, rowIdx) => (
          <div key={rowIdx} className="flex justify-center items-end gap-2 sm:gap-4">
            {rowPlayers.map(({ player, sel }) => (
              <PitchPlayerCard key={player.id} player={player} sel={sel} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function PitchPlayerCard({ player, sel }: { player: Player; sel: SelectionInfo }) {
  // Show last name in uppercase, truncated
  const displayName = player.name.split(' ').at(-1)?.toUpperCase() ?? player.name.toUpperCase()

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        <PlayerAvatar
          name={player.name}
          iplTeam={player.ipl_team}
          cricinfoId={player.cricinfo_id}
          size="md"
          className="shadow-lg shadow-black/50"
        />
        {sel.is_captain && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#ff6b00] border-2 border-white flex items-center justify-center text-white text-[10px] font-black shadow-lg">
            C
          </div>
        )}
        {sel.is_vice_captain && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#22c55e] border-2 border-white flex items-center justify-center text-white text-[10px] font-black shadow-lg">
            V
          </div>
        )}
      </div>
      {/* Name badge */}
      <div
        className="px-2.5 py-0.5 rounded text-white text-[10px] sm:text-xs font-bold tracking-wider whitespace-nowrap"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {displayName.length > 9 ? displayName.slice(0, 9) : displayName}
      </div>
    </div>
  )
}
