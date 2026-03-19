import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

const ROLE_LABELS: Record<string, string> = {
  batsman: '🏏 BAT',
  bowler: '⚡ BOWL',
  all_rounder: '🌟 AR',
  wicket_keeper: '🧤 WK',
}
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

type SelectionRow = {
  is_captain: boolean
  is_vice_captain: boolean
  ipl_players: {
    id: string
    name: string
    ipl_team: string
    role: string
    is_overseas: boolean
    fantasy_price: number
  } | null
}

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: league } = await supabase
    .from('leagues')
    .select('name, budget_per_team')
    .eq('id', id)
    .maybeSingle()
  if (!league) notFound()

  const { data: myMembership } = await supabase
    .from('league_members')
    .select('id, team_name, total_points')
    .eq('league_id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!myMembership) redirect('/dashboard')

  // Get latest gameweek
  const { data: gameweeks } = await supabase
    .from('gameweeks')
    .select('id, name, week_number, status')
    .order('week_number', { ascending: false })
    .limit(1)
  const latestGw = gameweeks?.[0] ?? null

  const { data: selections } = latestGw ? await supabase
    .from('weekly_selections')
    .select('is_captain, is_vice_captain, ipl_players(id, name, ipl_team, role, is_overseas, fantasy_price)')
    .eq('league_id', id)
    .eq('member_id', myMembership.id)
    .eq('gameweek_id', latestGw.id) : { data: [] }

  const rows = (selections ?? []) as unknown as SelectionRow[]
  const l = league as { name: string; budget_per_team: number }
  const mem = myMembership as { id: string; team_name: string | null; total_points: number }

  const byRole: Record<string, SelectionRow[]> = {
    wicket_keeper: [],
    batsman: [],
    all_rounder: [],
    bowler: [],
  }
  for (const row of rows) {
    const role = row.ipl_players?.role
    if (role && byRole[role]) byRole[role].push(row)
  }

  const totalCost = rows.reduce((sum, r) => sum + (r.ipl_players?.fantasy_price ?? 0), 0)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/leagues/${id}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground')}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">{mem.team_name ?? 'My Team'}</h1>
          <p className="text-sm text-muted-foreground">{l.name} · {latestGw?.name ?? 'No gameweek'}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card border-border text-center">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Players</p>
            <p className="text-2xl font-black text-[#ff6b00]">{rows.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border text-center">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Team cost</p>
            <p className="text-2xl font-black">₹{totalCost}L</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border text-center">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Points</p>
            <p className="text-2xl font-black text-[#00d4aa]">{Number(mem.total_points).toFixed(1)}</p>
          </CardContent>
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center text-muted-foreground">
            No team selected for {latestGw?.name ?? 'this gameweek'}.{' '}
            <Link href={`/leagues/${id}/select`} className="text-[#ff6b00] underline">Select your team →</Link>
          </CardContent>
        </Card>
      ) : (
        Object.entries(byRole).map(([role, players]) => {
          if (!players || players.length === 0) return null
          return (
            <Card key={role} className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">
                  {ROLE_LABELS[role]} ({players.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {players.map((row, idx) => {
                    const player = row.ipl_players
                    if (!player) return null
                    const teamColor = TEAM_COLORS[player.ipl_team] ?? 'bg-muted text-muted-foreground border-border'
                    return (
                      <div key={idx} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
                            {row.is_captain ? 'C' : row.is_vice_captain ? 'V' : '🏏'}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-sm">{player.name}</p>
                              {row.is_captain && (
                                <Badge className="text-xs bg-[#ff6b00]/20 text-[#ff6b00] border-[#ff6b00]/30">C 2×</Badge>
                              )}
                              {row.is_vice_captain && (
                                <Badge className="text-xs bg-[#00d4aa]/20 text-[#00d4aa] border-[#00d4aa]/30">VC 1.5×</Badge>
                              )}
                            </div>
                            <div className="flex gap-1 mt-0.5">
                              <Badge className={`text-xs border ${teamColor}`}>{player.ipl_team}</Badge>
                              {player.is_overseas && <Badge className="text-xs bg-[#ff6b00]/20 text-[#ff6b00]">OS</Badge>}
                            </div>
                          </div>
                        </div>
                        <p className="text-sm font-mono text-[#ff6b00]">₹{player.fantasy_price}L</p>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
