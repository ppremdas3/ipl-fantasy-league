/**
 * POST /api/points/sync-scorecard
 *
 * Admin manual trigger — fetches Cricbuzz scorecard for one match,
 * calculates fantasy points, and updates ALL leagues.
 *
 * Body: { match_id: string (DB UUID), league_id: string (for auth only) }
 */

import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  CricbuzzScorecard,
  parseScorecardStats,
  resolveMatchedPlayers,
  saveScorecardToDb,
} from '@/lib/scoring/scorecard-parser'

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

  const body = await request.json().catch(() => ({}))
  const { match_id, league_id } = body as { match_id?: string; league_id?: string }
  if (!match_id || !league_id) {
    return Response.json({ error: 'match_id and league_id are required' }, { status: 400 })
  }

  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) return Response.json({ error: 'RAPIDAPI_KEY not configured' }, { status: 500 })

  // Verify commissioner
  const { data: league } = await supabase
    .from('leagues').select('commissioner_id').eq('id', league_id).maybeSingle()
  if (!league || league.commissioner_id !== user.id) {
    return Response.json({ error: 'Not commissioner of this league' }, { status: 403 })
  }

  // Get match
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dbMatch } = await (supabase as any)
    .from('ipl_matches')
    .select('id, match_number, team1, team2, gameweek_id, cricbuzz_match_id')
    .eq('id', match_id)
    .maybeSingle()

  if (!dbMatch) return Response.json({ error: 'Match not found' }, { status: 404 })
  if (!dbMatch.cricbuzz_match_id) {
    return Response.json({ error: 'Match has no Cricbuzz ID. Run "Load Schedule" first.' }, { status: 422 })
  }
  if (!dbMatch.gameweek_id) {
    return Response.json({ error: 'Match has no gameweek assigned. Generate gameweeks first.' }, { status: 422 })
  }

  // Fetch scorecard
  let scorecard: CricbuzzScorecard
  try {
    const res = await fetch(
      `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${dbMatch.cricbuzz_match_id}/hscard`,
      { headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com' }, cache: 'no-store' }
    )
    if (!res.ok) throw new Error(`Cricbuzz HTTP ${res.status}`)
    scorecard = await res.json()
  } catch (err: unknown) {
    return Response.json({ error: `Cricbuzz request failed: ${err instanceof Error ? err.message : err}` }, { status: 502 })
  }

  if (!scorecard.scorecard?.length) {
    return Response.json({ error: `No scorecard data. Match may not be complete yet. Status: "${scorecard.status}"` }, { status: 422 })
  }

  // Fetch DB players
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dbPlayers } = await (supabase as any).from('ipl_players').select('id, name, cricbuzz_id, ipl_team, role')

  const { statsMap, cricbuzzIdByName } = parseScorecardStats(scorecard.scorecard)
  const { matched, unmatchedNames } = resolveMatchedPlayers(statsMap, cricbuzzIdByName, dbPlayers ?? [], match_id)

  if (matched.length === 0) {
    return Response.json({
      error: 'No players matched. Run "Sync Player IDs" first.',
      unmatched: unmatchedNames,
    }, { status: 422 })
  }

  const { memberResults, error: saveErr } = await saveScorecardToDb(
    supabase, match_id, dbMatch.gameweek_id, matched, scorecard.status
    // no leagueIds arg = updates ALL leagues
  )
  if (saveErr) return Response.json({ error: saveErr }, { status: 500 })

  return Response.json({
    success: true,
    match: { match_number: dbMatch.match_number, team1: dbMatch.team1, team2: dbMatch.team2, result: scorecard.status },
    stats: { players_fetched: statsMap.size, players_matched: matched.length, players_unmatched: unmatchedNames.length },
    member_results: memberResults,
    unmatched_players: unmatchedNames,
  })
}
