import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { calculatePoints } from '@/lib/scoring/fantasy-points'

interface PerfInput {
  player_id: string
  runs: number
  balls_faced: number
  fours: number
  sixes: number
  is_duck: boolean
  wickets: number
  overs_bowled: number
  runs_conceded: number
  maidens: number
  catches: number
  stumpings: number
  run_outs_direct: number
  run_outs_assist: number
}

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

  const { match_id, league_id, performances } = await request.json() as {
    match_id: string
    league_id: string
    performances: PerfInput[]
  }

  if (!match_id || !league_id || !performances?.length) {
    return Response.json({ error: 'match_id, league_id, and performances required' }, { status: 400 })
  }

  // Verify commissioner
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', league_id)
    .single()

  if (!league || league.commissioner_id !== user.id) {
    return Response.json({ error: 'Only the commissioner can simulate' }, { status: 403 })
  }

  // Get match's gameweek
  const { data: match } = await supabase
    .from('ipl_matches')
    .select('gameweek_id, team1, team2, match_number')
    .eq('id', match_id)
    .single()

  if (!match?.gameweek_id) {
    return Response.json({ error: 'Match has no gameweek assigned. Generate gameweeks first.' }, { status: 400 })
  }

  // Build player points map from provided performances (no DB write)
  const playerPoints = new Map<string, number>()
  for (const perf of performances) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pts = calculatePoints(perf as any)
    playerPoints.set(perf.player_id, pts)
  }

  // Fetch player names for display
  const playerIds = performances.map(p => p.player_id)
  const { data: players } = await supabase
    .from('ipl_players')
    .select('id, name, ipl_team, role')
    .in('id', playerIds)

  const playerMap = new Map(
    (players ?? []).map((p: { id: string; name: string; ipl_team: string; role: string }) => [p.id, p])
  )

  // Get all league members
  const { data: members } = await supabase
    .from('league_members')
    .select('id, team_name, user_id, total_points, profiles(display_name)')
    .eq('league_id', league_id)

  if (!members) return Response.json({ error: 'No members found' }, { status: 500 })

  // Compute per-member breakdown
  const memberResults = []

  for (const member of members) {
    const { data: selections } = await supabase
      .from('weekly_selections')
      .select('player_id, is_captain, is_vice_captain')
      .eq('league_id', league_id)
      .eq('member_id', member.id)
      .eq('gameweek_id', match.gameweek_id)

    if (!selections || selections.length === 0) {
      memberResults.push({
        member_id: member.id,
        team_name: member.team_name ?? 'Unnamed',
        display_name: (member.profiles as unknown as { display_name: string } | null)?.display_name ?? '',
        current_total: Number(member.total_points),
        has_selection: false,
        selection_count: 0,
        player_breakdown: [],
        match_pts: 0,
      })
      continue
    }

    let matchPts = 0
    const playerBreakdown = []

    for (const sel of selections) {
      const rawPts = playerPoints.get(sel.player_id) ?? 0
      const multiplier = sel.is_captain ? 2 : sel.is_vice_captain ? 1.5 : 1
      const finalPts = rawPts * multiplier
      matchPts += finalPts
      const info = playerMap.get(sel.player_id)
      playerBreakdown.push({
        player_id: sel.player_id,
        name: info?.name ?? 'Unknown Player',
        ipl_team: info?.ipl_team ?? '',
        role: info?.role ?? '',
        is_captain: sel.is_captain,
        is_vice_captain: sel.is_vice_captain,
        raw_pts: rawPts,
        multiplier,
        final_pts: finalPts,
        in_match: playerPoints.has(sel.player_id),
      })
    }

    playerBreakdown.sort((a, b) => b.final_pts - a.final_pts)

    memberResults.push({
      member_id: member.id,
      team_name: member.team_name ?? 'Unnamed',
      display_name: (member.profiles as unknown as { display_name: string } | null)?.display_name ?? '',
      current_total: Number(member.total_points),
      has_selection: true,
      selection_count: selections.length,
      player_breakdown: playerBreakdown,
      match_pts: matchPts,
    })
  }

  memberResults.sort((a, b) => b.match_pts - a.match_pts)

  return Response.json({
    match: {
      match_number: match.match_number,
      team1: match.team1,
      team2: match.team2,
      gameweek_id: match.gameweek_id,
    },
    member_results: memberResults,
    performances_evaluated: performances.length,
  })
}
