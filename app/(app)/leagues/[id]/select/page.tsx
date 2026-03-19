import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import PlayerPicker from '@/components/team-selection/PlayerPicker'

export default async function SelectTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ gw?: string }>
}) {
  const { id } = await params
  const { gw } = await searchParams

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

  // Fetch all gameweeks sorted
  const { data: allGameweeks } = await supabase
    .from('gameweeks')
    .select('*')
    .order('week_number')

  const gameweeks = allGameweeks ?? []
  const now = new Date()

  // Find the earliest upcoming gameweek (deadline not passed)
  const firstUpcoming = gameweeks.find(g => new Date(g.deadline) > now) ?? null

  // Determine which gameweek to select for
  let gameweek = firstUpcoming

  if (gw) {
    const requested = gameweeks.find(g => g.week_number === parseInt(gw)) ?? null

    if (requested) {
      // One-week-in-advance restriction:
      // Only allow selecting for the current upcoming week OR the very next one
      const firstUpcomingIndex = firstUpcoming
        ? gameweeks.findIndex(g => g.id === firstUpcoming.id)
        : -1
      const requestedIndex = gameweeks.findIndex(g => g.id === requested.id)

      const tooFarAhead = firstUpcomingIndex >= 0 && requestedIndex > firstUpcomingIndex + 1
      const deadlinePassed = new Date(requested.deadline) < now

      if (tooFarAhead) {
        // Show an error — can't select more than 1 week in advance
        return (
          <div className="max-w-lg mx-auto space-y-4">
            <div className="flex items-center gap-3">
              <Link href={`/leagues/${id}/team`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground')}>
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <h1 className="text-xl font-bold">Select Team</h1>
            </div>
            <Card className="bg-card border-border">
              <CardContent className="py-16 text-center text-muted-foreground">
                <p className="text-2xl mb-3">🔒</p>
                <p className="font-semibold text-white mb-1">Not available yet</p>
                <p className="text-sm">You can only select a team up to one gameweek in advance.</p>
                <p className="text-sm mt-1">
                  Come back once <strong>{firstUpcoming?.name ?? 'the current week'}</strong> is underway.
                </p>
              </CardContent>
            </Card>
          </div>
        )
      }

      if (deadlinePassed) {
        return (
          <div className="max-w-lg mx-auto space-y-4">
            <div className="flex items-center gap-3">
              <Link href={`/leagues/${id}/team`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground')}>
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <h1 className="text-xl font-bold">Select Team</h1>
            </div>
            <Card className="bg-card border-border">
              <CardContent className="py-16 text-center text-muted-foreground">
                <p className="text-2xl mb-3">⏰</p>
                <p className="font-semibold text-white mb-1">Deadline passed</p>
                <p className="text-sm">Team selection for {requested.name} is now locked.</p>
              </CardContent>
            </Card>
          </div>
        )
      }

      gameweek = requested
    }
  }

  // Fetch all players
  const { data: players } = await supabase
    .from('ipl_players')
    .select('id, name, ipl_team, role, fantasy_price, is_overseas, cricinfo_id')
    .order('fantasy_price', { ascending: false })

  // Fetch existing selection for this gameweek
  const existingSelection = gameweek
    ? await supabase
        .from('weekly_selections')
        .select('player_id, is_captain, is_vice_captain')
        .eq('league_id', id)
        .eq('member_id', member.id)
        .eq('gameweek_id', gameweek.id)
        .then(({ data }) => data ?? [])
    : []

  const l = league as { name: string; budget_per_team: number; status: string }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/leagues/${id}/team`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground')}
        >
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
            No active gameweek. The commissioner needs to add matches and generate gameweeks first.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {gameweek.name} · {new Date(gameweek.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} –{' '}
              {new Date(gameweek.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
            <span>
              Deadline: {new Date(gameweek.deadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
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
