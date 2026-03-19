import { IplPlayer } from '@/lib/supabase/types'
import { Badge } from '@/components/ui/badge'

const TEAM_COLORS: Record<string, string> = {
  MI: 'bg-blue-900/40 text-blue-300 border-blue-700',
  CSK: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  RCB: 'bg-red-900/40 text-red-300 border-red-700',
  KKR: 'bg-purple-900/40 text-purple-300 border-purple-700',
  RR: 'bg-pink-900/40 text-pink-300 border-pink-700',
  DC: 'bg-blue-800/40 text-blue-200 border-blue-600',
  PBKS: 'bg-red-800/40 text-red-200 border-red-600',
  SRH: 'bg-orange-900/40 text-orange-300 border-orange-700',
  LSG: 'bg-lime-900/40 text-lime-300 border-lime-700',
  GT: 'bg-indigo-900/40 text-indigo-300 border-indigo-700',
}

const ROLE_LABELS: Record<string, string> = {
  batsman: '🏏 Batsman',
  bowler: '⚡ Bowler',
  all_rounder: '🌟 All-Rounder',
  wicket_keeper: '🧤 WK',
}

interface Props {
  player: IplPlayer
}

export default function PlayerCard({ player }: Props) {
  const teamColor = TEAM_COLORS[player.ipl_team] ?? 'bg-muted text-muted-foreground border-border'

  return (
    <div className="text-center space-y-4">
      {/* Avatar */}
      <div className="w-24 h-24 rounded-full bg-muted mx-auto flex items-center justify-center text-4xl">
        🏏
      </div>

      <div>
        <h2 className="text-2xl font-black text-foreground">{player.name}</h2>
        <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
          <Badge className={`border ${teamColor}`}>{player.ipl_team}</Badge>
          <Badge className="bg-muted text-muted-foreground">{ROLE_LABELS[player.role]}</Badge>
          {player.is_overseas && (
            <Badge className="bg-[#ff6b00]/20 text-[#ff6b00] border-[#ff6b00]/30">Overseas</Badge>
          )}
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        Base price: <span className="text-[#ff6b00] font-bold">₹{player.base_price}L</span>
      </div>
    </div>
  )
}
