import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import PlayerPicker from '@/components/team-selection/PlayerPicker'

export default async function SelectTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: league } = await supabase
    .from('leagues')
    .select('name, budget_per_team, status')
    .eq('id', id)
    .maybeSingle()

  if (!league) notFound()

  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member) redirect('/dashboard')

  // Find the current or next available gameweek
  const { data: gameweeks } = await supabase
    .from('gameweeks')
    .select('*')
    .in('status', ['upcoming', 'active'])
    .order('week_number')
    .limit(1)

  const gameweek = gameweeks?.[0] ?? null

  // Fetch all players with pricing
  const { data: players } = await supabase
    .from('ipl_players')
    .select('id, name, ipl_team, role, fantasy_price, is_overseas')
    .order('fantasy_price', { ascending: false })

  // Fetch existing selection for this gameweek
  const existingSelection = gameweek ? await supabase
    .from('weekly_selections')
    .select('player_id, is_captain, is_vice_captain')
    .eq('league_id', id)
    .eq('member_id', member.id)
    .eq('gameweek_id', gameweek.id)
    .then(({ data }) => data ?? []) : []

  const l = league as { name: string; budget_per_team: number; status: string }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/leagues/${id}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground')}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Select Team</h1>
          <p className="text-sm text-muted-foreground">{l.name}</p>
        </div>
      </div>

      {!gameweek ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center text-muted-foreground">
            No active gameweek. The commissioner needs to fetch the match schedule first.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{gameweek.name} · {new Date(gameweek.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – {new Date(gameweek.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
            <span>Deadline: {new Date(gameweek.deadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <PlayerPicker
            players={(players ?? []) as any}
            leagueId={id}
            gameweekId={gameweek.id}
            gameweekName={gameweek.name}
            deadline={gameweek.deadline}
            existingSelection={(existingSelection as any[]).map((s: any) => ({
              player_id: s.player_id,
              is_captain: s.is_captain,
              is_vice_captain: s.is_vice_captain,
            }))}
          />
        </>
      )}
    </div>
  )
}
