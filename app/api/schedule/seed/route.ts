/**
 * POST /api/schedule/seed
 *
 * Fetches the full IPL 2026 season schedule from Cricbuzz (1 API request)
 * and upserts all matches + generates gameweeks.
 *
 * Requires RAPIDAPI_KEY in environment (add to Vercel env vars for production).
 *
 * Prerequisites — run once in Supabase SQL editor if not done yet:
 *   ALTER TABLE ipl_matches ADD COLUMN IF NOT EXISTS cricbuzz_match_id TEXT;
 *   CREATE UNIQUE INDEX IF NOT EXISTS ipl_matches_cricbuzz_id_idx ON ipl_matches(cricbuzz_match_id);
 */

import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const IPL_SERIES_ID = 9241

// Cricbuzz team short name → our DB abbreviation (for any mismatches)
const TEAM_MAP: Record<string, string> = {
  'RCB':  'RCB', 'SRH':  'SRH', 'MI':   'MI',  'KKR':  'KKR',
  'RR':   'RR',  'CSK':  'CSK', 'PBKS': 'PBKS', 'GT':   'GT',
  'LSG':  'LSG', 'DC':   'DC',
}

interface CricbuzzMatchInfo {
  matchId: number
  matchDesc: string       // "1st Match", "2nd Match", …
  state: string           // "Upcoming" | "In Progress" | "Complete"
  status?: string         // result text when complete
  startDate: string       // unix ms as string
  team1: { teamSName: string }
  team2: { teamSName: string }
  venueInfo?: { ground: string; city: string }
}

interface MatchDetailsItem {
  matchDetailsMap?: {
    match: { matchInfo: CricbuzzMatchInfo }[]
  }
}

function parseMatchNumber(desc: string): number | null {
  const m = desc.match(/^(\d+)/)
  return m ? parseInt(m[1]) : null
}

function mapState(state: string): 'upcoming' | 'live' | 'completed' {
  const s = state.toLowerCase()
  if (s.includes('complete') || s.includes('result')) return 'completed'
  if (s.includes('progress') || s.includes('live'))   return 'live'
  return 'upcoming'
}

export async function POST(_request: NextRequest) {
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

  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) {
    return Response.json(
      { error: 'RAPIDAPI_KEY not set. Add it to environment variables.' },
      { status: 500 }
    )
  }

  // ── Fetch full season schedule from Cricbuzz (1 request) ──
  let seriesData: { matchDetails: MatchDetailsItem[] }
  try {
    const res = await fetch(
      `https://cricbuzz-cricket.p.rapidapi.com/series/v1/${IPL_SERIES_ID}`,
      {
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
        },
        cache: 'no-store',
      }
    )
    if (!res.ok) throw new Error(`Cricbuzz returned HTTP ${res.status}`)
    seriesData = await res.json()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: `Cricbuzz request failed: ${msg}` }, { status: 502 })
  }

  // ── Parse matches ──
  const matchRows: {
    match_number: number
    cricbuzz_match_id: string
    team1: string
    team2: string
    scheduled_at: string
    venue: string | null
    status: 'upcoming' | 'live' | 'completed'
  }[] = []

  for (const item of seriesData.matchDetails ?? []) {
    if (!item.matchDetailsMap) continue
    for (const { matchInfo: m } of item.matchDetailsMap.match ?? []) {
      const matchNumber = parseMatchNumber(m.matchDesc)
      if (!matchNumber) continue

      const t1 = TEAM_MAP[m.team1.teamSName] ?? m.team1.teamSName
      const t2 = TEAM_MAP[m.team2.teamSName] ?? m.team2.teamSName

      matchRows.push({
        match_number:      matchNumber,
        cricbuzz_match_id: String(m.matchId),
        team1:             t1,
        team2:             t2,
        scheduled_at:      new Date(parseInt(m.startDate)).toISOString(),
        venue:             m.venueInfo ? `${m.venueInfo.ground}, ${m.venueInfo.city}` : null,
        status:            mapState(m.state),
      })
    }
  }

  if (matchRows.length === 0) {
    return Response.json(
      { error: 'No matches found in Cricbuzz response. The series may not be available yet.' },
      { status: 422 }
    )
  }

  // ── Upsert matches ──
  const { error: matchErr } = await supabase
    .from('ipl_matches')
    .upsert(matchRows, { onConflict: 'match_number' })

  if (matchErr) return Response.json({ error: matchErr.message }, { status: 500 })

  // ── Auto-generate gameweeks ──
  const { data: allMatches } = await supabase
    .from('ipl_matches')
    .select('id, scheduled_at, match_number')
    .not('scheduled_at', 'is', null)
    .order('scheduled_at')

  let gameweeksCreated = 0

  if (allMatches && allMatches.length > 0) {
    const weeks = new Map<string, { start: Date; end: Date; matchIds: string[]; firstMatch: Date }>()

    for (const match of allMatches) {
      const d = new Date(match.scheduled_at!)
      const monday = getMonday(d)
      const sunday = new Date(monday)
      sunday.setDate(sunday.getDate() + 6)
      const key = monday.toISOString().split('T')[0]
      if (!weeks.has(key)) weeks.set(key, { start: monday, end: sunday, matchIds: [], firstMatch: d })
      weeks.get(key)!.matchIds.push(match.id)
    }

    const weekEntries = Array.from(weeks.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    const gameweekRows = weekEntries.map(([, w], i) => ({
      week_number: i + 1,
      name:        `Week ${i + 1}`,
      start_date:  w.start.toISOString().split('T')[0],
      end_date:    w.end.toISOString().split('T')[0],
      deadline:    w.firstMatch.toISOString(),
      status:      'upcoming' as const,
    }))

    const { data: insertedWeeks, error: weekErr } = await supabase
      .from('gameweeks')
      .upsert(gameweekRows, { onConflict: 'week_number' })
      .select('id, week_number')

    if (weekErr) return Response.json({ error: weekErr.message }, { status: 500 })

    if (insertedWeeks) {
      gameweeksCreated = insertedWeeks.length
      for (const [key, w] of weeks) {
        const weekNum = weekEntries.findIndex(([k]) => k === key) + 1
        const gw = insertedWeeks.find((g: { id: string; week_number: number }) => g.week_number === weekNum)
        if (gw) await supabase.from('ipl_matches').update({ gameweek_id: gw.id }).in('id', w.matchIds)
      }
    }
  }

  return Response.json({
    success:          true,
    matches_imported: matchRows.length,
    gameweeks_created: gameweeksCreated,
    message:          `Imported ${matchRows.length} matches and created ${gameweeksCreated} gameweeks`,
  })
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day  = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}
