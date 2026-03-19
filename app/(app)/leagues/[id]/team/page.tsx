import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button-variants'
import { ArrowLeft, Zap, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import PitchView from '@/components/team/PitchView'

type Player = {
  id: string
  name: string
  ipl_team: string
  role: string
  fantasy_price: number
  is_overseas: boolean
  cricinfo_id: string | null
}

type SelectionRow = {
  player_id: string
  is_captain: boolean
  is_vice_captain: boolean
  ipl_players: Player | null
}

type Gameweek = {
  id: string
  week_number: number
  name: string
  deadline: string
  status: string
}

export default async function TeamPage({
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

  // Fetch all gameweeks for tabs
  const { data: allGameweeks } = await supabase
    .from('gameweeks')
    .select('id, week_number, name, deadline, status')
    .order('week_number')

  const gameweeks = (allGameweeks ?? []) as Gameweek[]

  // Determine which gameweek to display
  // Default: current active/most recent, or the one specified by ?gw=
  const now = new Date()
  let displayGw: Gameweek | null = null

  if (gw) {
    displayGw = gameweeks.find(g => g.week_number === parseInt(gw)) ?? null
  }
  if (!displayGw) {
    // Pick the current active gameweek, or the latest one with selections
    displayGw =
      gameweeks.find(g => g.status === 'active') ??
      gameweeks.findLast(g => new Date(g.deadline) < now) ??
      gameweeks[0] ??
      null
  }

  // Fetch all players for pitch rendering
  const { data: allPlayers } = await supabase
    .from('ipl_players')
    .select('id, name, ipl_team, role, fantasy_price, is_overseas, cricinfo_id')

  const players = (allPlayers ?? []) as Player[]

  // Fetch selection for the displayed gameweek
  const { data: rawSelections } = displayGw
    ? await supabase
        .from('weekly_selections')
        .select('player_id, is_captain, is_vice_captain, ipl_players(id, name, ipl_team, role, fantasy_price, is_overseas, cricinfo_id)')
        .eq('league_id', id)
        .eq('member_id', myMembership.id)
        .eq('gameweek_id', displayGw.id)
    : { data: [] }

  const rows = (rawSelections ?? []) as unknown as SelectionRow[]
  const selections = rows.map(r => ({
    player_id: r.player_id,
    is_captain: r.is_captain,
    is_vice_captain: r.is_vice_captain,
  }))

  // Enrich players list with selections' player data (for cricinfo_id etc.)
  const selectionPlayers = rows
    .map(r => r.ipl_players)
    .filter(Boolean) as Player[]
  const mergedPlayers = [
    ...players,
    ...selectionPlayers.filter(sp => !players.find(p => p.id === sp.id)),
  ]

  const totalCost = selectionPlayers.reduce((s, p) => s + (p?.fantasy_price ?? 0), 0)

  // ── Next-week CTA logic ──
  // Find current active/upcoming gameweek (deadline not passed)
  const currentGw = gameweeks.find(g => new Date(g.deadline) > now) ?? null
  // Next gameweek = one immediately after current
  const nextGw = currentGw
    ? gameweeks.find(g => g.week_number === currentGw.week_number + 1) ?? null
    : null

  // Show "Select for next week" if:
  // - next gameweek exists
  // - its deadline hasn't passed
  // - it's at most 1 week ahead of the earliest active/upcoming week
  const canSelectNextWeek =
    nextGw !== null && new Date(nextGw.deadline) > now

  // Can still change current week's selection?
  const canSelectCurrentWeek =
    currentGw !== null &&
    new Date(currentGw.deadline) > now &&
    displayGw?.id === currentGw?.id

  const l = league as { name: string; budget_per_team: number }
  const mem = myMembership as { id: string; team_name: string | null; total_points: number }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/leagues/${id}`}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">{mem.team_name ?? 'My Team'}</h1>
            <p className="text-sm text-muted-foreground">{l.name}</p>
          </div>
        </div>

        {/* Next week CTA */}
        {canSelectNextWeek && (
          <Link
            href={`/leagues/${id}/select?gw=${nextGw!.week_number}`}
            className={cn(buttonVariants({ size: 'sm' }), 'bg-[#ff6b00] hover:bg-[#e55c00] text-white gap-1.5 shrink-0')}
          >
            <Zap className="w-3.5 h-3.5" />
            Select for {nextGw!.name}
          </Link>
        )}
        {canSelectCurrentWeek && !canSelectNextWeek && (
          <Link
            href={`/leagues/${id}/select`}
            className={cn(buttonVariants({ size: 'sm' }), 'bg-[#ff6b00] hover:bg-[#e55c00] text-white gap-1.5 shrink-0')}
          >
            <Zap className="w-3.5 h-3.5" />
            Edit {currentGw!.name}
          </Link>
        )}
      </div>

      {/* Gameweek tabs */}
      {gameweeks.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {gameweeks.map(gw => {
            const isActive = gw.id === displayGw?.id
            const isPast = new Date(gw.deadline) < now
            return (
              <Link
                key={gw.id}
                href={`/leagues/${id}/team?gw=${gw.week_number}`}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition-all shrink-0',
                  isActive
                    ? 'bg-[#ff6b00] border-[#ff6b00] text-white'
                    : 'bg-card border-border text-muted-foreground hover:border-[#ff6b00]/40 hover:text-white'
                )}
              >
                {isPast && <Lock className="w-3 h-3" />}
                {gw.name}
              </Link>
            )
          })}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Players</p>
          <p className="text-2xl font-black text-[#ff6b00]">{rows.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Team cost</p>
          <p className="text-2xl font-black text-white">₹{totalCost}L</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Total pts</p>
          <p className="text-2xl font-black text-[#22c55e]">{Number(mem.total_points).toFixed(1)}</p>
        </div>
      </div>

      {/* Pitch view or empty state */}
      {rows.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl py-16 text-center">
          <p className="text-4xl mb-3">🏏</p>
          <p className="text-muted-foreground text-sm mb-4">
            No team selected for {displayGw?.name ?? 'this gameweek'}
          </p>
          {currentGw && new Date(currentGw.deadline) > now && (
            <Link
              href={`/leagues/${id}/select`}
              className={cn(buttonVariants({ size: 'sm' }), 'bg-[#ff6b00] hover:bg-[#e55c00] text-white')}
            >
              Select your team →
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-4">
          {/* Gameweek + deadline info */}
          <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
            <span>{displayGw?.name}</span>
            <span className="flex items-center gap-1">
              {displayGw && new Date(displayGw.deadline) < now
                ? <><Lock className="w-3 h-3" /> Locked</>
                : `Deadline: ${displayGw ? new Date(displayGw.deadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`
              }
            </span>
          </div>
          <PitchView players={mergedPlayers} selections={selections} />
        </div>
      )}
    </div>
  )
}
