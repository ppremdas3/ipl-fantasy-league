import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { calculatePoints } from '@/lib/scoring/fantasy-points'

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

  const { match_id, league_id } = await request.json()
  if (!match_id || !league_id) {
    return Response.json({ error: 'match_id and league_id required' }, { status: 400 })
  }

  // Verify commissioner
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', league_id)
    .single()

  if (!league || league.commissioner_id !== user.id) {
    return Response.json({ error: 'Only the commissioner can recalculate points' }, { status: 403 })
  }

  // Get performances and match's gameweek
  const { data: match } = await supabase
    .from('ipl_matches')
    .select('gameweek_id')
    .eq('id', match_id)
    .single()

  const { data: perfs, error: perfErr } = await supabase
    .from('player_performances')
    .select('*')
    .eq('match_id', match_id)

  if (perfErr || !perfs) return Response.json({ error: 'Failed to fetch performances' }, { status: 500 })

  // Calculate and update fantasy_points per performance
  const playerPoints = new Map<string, number>()
  for (const perf of perfs) {
    const pts = calculatePoints(perf)
    await supabase.from('player_performances').update({ fantasy_points: pts }).eq('id', perf.id)
    playerPoints.set(perf.player_id, pts)
  }

  // Get all league members
  const { data: members } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', league_id)

  if (!members) return Response.json({ error: 'No members found' }, { status: 500 })

  let membersUpdated = 0

  for (const member of members) {
    // Get this member's weekly selection for the match's gameweek
    const gameweekId = match?.gameweek_id ?? null
    if (!gameweekId) continue

    const { data: selections } = await supabase
      .from('weekly_selections')
      .select('player_id, is_captain, is_vice_captain')
      .eq('league_id', league_id)
      .eq('member_id', member.id)
      .eq('gameweek_id', gameweekId)

    if (!selections || selections.length === 0) continue

    // Sum points with captain (2x) and VC (1.5x) multipliers
    let matchPoints = 0
    for (const sel of selections) {
      const rawPts = playerPoints.get(sel.player_id) ?? 0
      const multiplier = sel.is_captain ? 2 : sel.is_vice_captain ? 1.5 : 1
      matchPoints += rawPts * multiplier
    }

    // Add to member's total_points
    const { data: memberRow } = await supabase
      .from('league_members')
      .select('total_points')
      .eq('id', member.id)
      .single()

    if (memberRow) {
      await supabase
        .from('league_members')
        .update({ total_points: Number(memberRow.total_points) + matchPoints })
        .eq('id', member.id)
      membersUpdated++
    }
  }

  return Response.json({
    success: true,
    performances_updated: perfs.length,
    members_updated: membersUpdated,
  })
}
