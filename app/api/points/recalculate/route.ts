import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { calculatePoints } from '@/lib/scoring/fantasy-points'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()

  const anonSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )

  const { data: { user } } = await anonSupabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { match_id, league_id } = await request.json()
  if (!match_id || !league_id) {
    return Response.json({ error: 'match_id and league_id required' }, { status: 400 })
  }

  // Verify commissioner of this league
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', league_id)
    .single()

  if (!league || league.commissioner_id !== user.id) {
    return Response.json({ error: 'Only the commissioner can recalculate points' }, { status: 403 })
  }

  // Get all performances for this match
  const { data: perfs, error: perfErr } = await supabase
    .from('player_performances')
    .select('*')
    .eq('match_id', match_id)

  if (perfErr || !perfs) {
    return Response.json({ error: 'Failed to fetch performances' }, { status: 500 })
  }

  // Calculate and update fantasy_points for each performance
  const updates = perfs.map(perf => {
    const pts = calculatePoints(perf)
    return { id: perf.id, fantasy_points: pts }
  })

  for (const upd of updates) {
    await supabase
      .from('player_performances')
      .update({ fantasy_points: upd.fantasy_points })
      .eq('id', upd.id)
  }

  // Now recalculate total_points for each team member in this league
  // Get all team players in this league
  const { data: teamPlayers } = await supabase
    .from('team_players')
    .select('member_id, player_id')
    .eq('league_id', league_id)

  if (!teamPlayers) return Response.json({ error: 'No team data' }, { status: 500 })

  // Build a map: player_id -> fantasy_points from this match
  const playerPoints = new Map<string, number>()
  for (const perf of perfs) {
    const upd = updates.find(u => u.id === perf.id)
    if (upd) playerPoints.set(perf.player_id, upd.fantasy_points)
  }

  // Group by member
  const memberPointsMap = new Map<string, number>()
  for (const tp of teamPlayers) {
    const pts = playerPoints.get(tp.player_id) ?? 0
    memberPointsMap.set(tp.member_id, (memberPointsMap.get(tp.member_id) ?? 0) + pts)
  }

  // Update total_points for each member (add this match's points)
  for (const [memberId, pts] of memberPointsMap) {
    const { data: member } = await supabase
      .from('league_members')
      .select('total_points')
      .eq('id', memberId)
      .single()
    if (member) {
      await supabase
        .from('league_members')
        .update({ total_points: Number(member.total_points) + pts })
        .eq('id', memberId)
    }
  }

  return Response.json({
    success: true,
    performances_updated: updates.length,
    members_updated: memberPointsMap.size,
  })
}
