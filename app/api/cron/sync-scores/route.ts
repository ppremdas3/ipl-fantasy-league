/**
 * GET /api/cron/sync-scores
 *
 * Triggered by Vercel Cron at 14:30 UTC and 18:30 UTC daily (IST 8 PM and midnight).
 * Finds all matches that started 4.5+ hours ago and are not yet completed,
 * fetches their scorecards, and updates fantasy points across ALL leagues.
 *
 * Protected by CRON_SECRET — Vercel adds Authorization: Bearer <secret> automatically.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  CricbuzzScorecard,
  parseScorecardStats,
  resolveMatchedPlayers,
  saveScorecardToDb,
} from '@/lib/scoring/scorecard-parser'

const HOURS_AFTER_START = 4.5

export async function GET(request: NextRequest) {
  // ── Verify cron secret ──
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) return Response.json({ error: 'RAPIDAPI_KEY not configured' }, { status: 500 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Find matches due for sync ──
  // A match is due if: started >= 4.5h ago, not completed, has cricbuzz_match_id
  const cutoff = new Date(Date.now() - HOURS_AFTER_START * 60 * 60 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dueMatches, error: matchErr } = await (supabase as any)
    .from('ipl_matches')
    .select('id, match_number, team1, team2, gameweek_id, cricbuzz_match_id, scheduled_at')
    .not('cricbuzz_match_id', 'is', null)
    .neq('status', 'completed')
    .lte('scheduled_at', cutoff)
    .order('scheduled_at')

  if (matchErr) {
    console.error('[cron/sync-scores] DB query failed:', matchErr.message)
    return Response.json({ error: matchErr.message }, { status: 500 })
  }

  if (!dueMatches?.length) {
    console.log('[cron/sync-scores] No matches due for sync at', new Date().toISOString())
    return Response.json({ synced: 0, message: 'No matches due for sync' })
  }

  console.log(`[cron/sync-scores] ${dueMatches.length} match(es) due:`, dueMatches.map((m: { match_number: number }) => `M#${m.match_number}`).join(', '))

  // Fetch all DB players once (reused across matches)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dbPlayers } = await (supabase as any)
    .from('ipl_players')
    .select('id, name, cricbuzz_id, ipl_team, role')

  const results = []
  let apiRequestsUsed = 0

  for (const match of dueMatches) {
    console.log(`[cron/sync-scores] Processing M#${match.match_number}: ${match.team1} vs ${match.team2}`)

    // Fetch scorecard (1 API request per match)
    let scorecard: CricbuzzScorecard
    try {
      const res = await fetch(
        `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${match.cricbuzz_match_id}/hscard`,
        {
          headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com' },
          cache: 'no-store',
        }
      )
      apiRequestsUsed++
      if (!res.ok) throw new Error(`Cricbuzz HTTP ${res.status}`)
      scorecard = await res.json()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron/sync-scores] M#${match.match_number} scorecard fetch failed:`, msg)
      results.push({ match_number: match.match_number, status: 'error', error: msg })
      continue
    }

    if (!scorecard.scorecard?.length) {
      // Match not yet complete — skip silently, will retry next cron run
      console.log(`[cron/sync-scores] M#${match.match_number} not complete yet (${scorecard.status})`)
      results.push({ match_number: match.match_number, status: 'skipped', reason: scorecard.status })
      continue
    }

    const { statsMap, cricbuzzIdByName } = parseScorecardStats(scorecard.scorecard)
    const { matched, unmatchedNames } = resolveMatchedPlayers(statsMap, cricbuzzIdByName, dbPlayers ?? [], match.id)

    if (matched.length === 0) {
      console.warn(`[cron/sync-scores] M#${match.match_number} — no players matched, skipping`)
      results.push({ match_number: match.match_number, status: 'skipped', reason: 'no_players_matched', unmatched: unmatchedNames })
      continue
    }

    if (!match.gameweek_id) {
      console.warn(`[cron/sync-scores] M#${match.match_number} — no gameweek_id, skipping`)
      results.push({ match_number: match.match_number, status: 'skipped', reason: 'no_gameweek' })
      continue
    }

    const { memberResults, error: saveErr } = await saveScorecardToDb(
      supabase, match.id, match.gameweek_id, matched, scorecard.status
      // no leagueIds = updates ALL leagues
    )

    if (saveErr) {
      console.error(`[cron/sync-scores] M#${match.match_number} save failed:`, saveErr)
      results.push({ match_number: match.match_number, status: 'error', error: saveErr })
      continue
    }

    console.log(`[cron/sync-scores] M#${match.match_number} done — ${matched.length} players, ${memberResults.length} member updates`)
    results.push({
      match_number:      match.match_number,
      status:            'synced',
      players_matched:   matched.length,
      players_unmatched: unmatchedNames.length,
      members_updated:   memberResults.length,
      result:            scorecard.status,
    })
  }

  return Response.json({
    synced_at:          new Date().toISOString(),
    api_requests_used:  apiRequestsUsed,
    matches_processed:  dueMatches.length,
    results,
  })
}
