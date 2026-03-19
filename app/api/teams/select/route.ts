import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const BUDGET = 10000 // lakhs (₹100 crore)
const SQUAD_SIZE = 11
const MAX_FROM_SAME_TEAM = 4

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()

  const anonSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await anonSupabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { league_id, gameweek_id, players } = body as {
    league_id: string
    gameweek_id: string
    players: { player_id: string; is_captain: boolean; is_vice_captain: boolean }[]
  }

  if (!league_id || !gameweek_id || !players) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Verify gameweek deadline not passed
  const { data: gameweek } = await supabase
    .from('gameweeks')
    .select('deadline, status')
    .eq('id', gameweek_id)
    .single()

  if (!gameweek) return Response.json({ error: 'Gameweek not found' }, { status: 404 })
  if (new Date(gameweek.deadline) < new Date()) {
    return Response.json({ error: 'Deadline has passed for this gameweek' }, { status: 400 })
  }

  // Get member record
  const { data: member } = await supabase
    .from('league_members')
    .select('id, budget_remaining')
    .eq('league_id', league_id)
    .eq('user_id', user.id)
    .single()

  if (!member) return Response.json({ error: 'You are not in this league' }, { status: 403 })

  // Validate squad size
  if (players.length !== SQUAD_SIZE) {
    return Response.json({ error: `Select exactly ${SQUAD_SIZE} players (you selected ${players.length})` }, { status: 400 })
  }

  // Validate captain and vice-captain
  const captains = players.filter(p => p.is_captain)
  const vcs = players.filter(p => p.is_vice_captain)
  if (captains.length !== 1) return Response.json({ error: 'Select exactly 1 captain' }, { status: 400 })
  if (vcs.length !== 1) return Response.json({ error: 'Select exactly 1 vice-captain' }, { status: 400 })
  if (captains[0].player_id === vcs[0].player_id) {
    return Response.json({ error: 'Captain and vice-captain must be different players' }, { status: 400 })
  }

  // Fetch player details
  const playerIds = players.map(p => p.player_id)
  const { data: playerDetails } = await supabase
    .from('ipl_players')
    .select('id, ipl_team, role, fantasy_price')
    .in('id', playerIds)

  if (!playerDetails || playerDetails.length !== SQUAD_SIZE) {
    return Response.json({ error: 'One or more players not found' }, { status: 400 })
  }

  // Validate budget
  const totalCost = playerDetails.reduce((sum, p) => sum + (p.fantasy_price ?? 600), 0)
  const leagueBudget = BUDGET
  if (totalCost > leagueBudget) {
    return Response.json({ error: `Over budget: ₹${totalCost}L selected, max ₹${leagueBudget}L` }, { status: 400 })
  }

  // Validate max 4 from same IPL team
  const teamCounts: Record<string, number> = {}
  for (const p of playerDetails) {
    teamCounts[p.ipl_team] = (teamCounts[p.ipl_team] ?? 0) + 1
  }
  for (const [team, count] of Object.entries(teamCounts)) {
    if (count > MAX_FROM_SAME_TEAM) {
      return Response.json({ error: `Max ${MAX_FROM_SAME_TEAM} players from ${team} (you have ${count})` }, { status: 400 })
    }
  }

  // Validate role constraints
  const roleCounts: Record<string, number> = { batsman: 0, bowler: 0, all_rounder: 0, wicket_keeper: 0 }
  for (const p of playerDetails) roleCounts[p.role] = (roleCounts[p.role] ?? 0) + 1

  if (roleCounts.wicket_keeper < 1 || roleCounts.wicket_keeper > 4)
    return Response.json({ error: `Need 1–4 wicket-keepers (you have ${roleCounts.wicket_keeper})` }, { status: 400 })
  if (roleCounts.batsman < 3 || roleCounts.batsman > 6)
    return Response.json({ error: `Need 3–6 batsmen (you have ${roleCounts.batsman})` }, { status: 400 })
  if (roleCounts.all_rounder < 1 || roleCounts.all_rounder > 4)
    return Response.json({ error: `Need 1–4 all-rounders (you have ${roleCounts.all_rounder})` }, { status: 400 })
  if (roleCounts.bowler < 3 || roleCounts.bowler > 6)
    return Response.json({ error: `Need 3–6 bowlers (you have ${roleCounts.bowler})` }, { status: 400 })

  // Replace selection atomically: delete existing, insert new
  const { error: deleteErr } = await supabase
    .from('weekly_selections')
    .delete()
    .eq('league_id', league_id)
    .eq('member_id', member.id)
    .eq('gameweek_id', gameweek_id)

  if (deleteErr) return Response.json({ error: deleteErr.message }, { status: 500 })

  const rows = players.map(p => ({
    league_id,
    member_id: member.id,
    gameweek_id,
    player_id: p.player_id,
    is_captain: p.is_captain,
    is_vice_captain: p.is_vice_captain,
  }))

  const { error: insertErr } = await supabase.from('weekly_selections').insert(rows)
  if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })

  return Response.json({ success: true, total_cost: totalCost })
}
