import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ESPNcricinfo series ID for IPL 2026
// Find at: https://www.espncricinfo.com/series/indian-premier-league-2026
const IPL_2026_SERIES_ID = '1449491' // Update if incorrect

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

  // Allow optional series ID override from request body
  const body = await request.json().catch(() => ({}))
  const seriesId = body.series_id || IPL_2026_SERIES_ID

  // Fetch schedule from ESPNcricinfo consumer API
  let scheduleData: any
  try {
    const res = await fetch(
      `https://hs-consumer-api.espncricinfo.com/v1/pages/series/schedule?lang=en&seriesId=${seriesId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://www.espncricinfo.com/',
          'Origin': 'https://www.espncricinfo.com',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
        },
        next: { revalidate: 0 },
      }
    )
    if (!res.ok) throw new Error(`ESPNcricinfo returned ${res.status}`)
    scheduleData = await res.json()
  } catch (err: any) {
    return Response.json({ error: `Failed to fetch from ESPNcricinfo: ${err.message}` }, { status: 502 })
  }

  // Parse matches from ESPNcricinfo response
  const matches = scheduleData?.content?.matchScheduleMap ?? scheduleData?.matchScheduleMap ?? []

  const matchRows: {
    match_number: number
    team1: string
    team2: string
    venue: string | null
    scheduled_at: string | null
    status: 'upcoming' | 'live' | 'completed'
  }[] = []

  for (const group of matches) {
    const groupMatches = group.matchScheduleList ?? group.matches ?? []
    for (const m of groupMatches) {
      const teams = m.teams ?? m.matchTeams ?? []
      if (teams.length < 2) continue

      const matchNumber = m.matchNumber ?? m.match_number
      if (!matchNumber) continue

      const team1 = teams[0]?.team?.longName ?? teams[0]?.longName ?? teams[0]?.name ?? 'TBD'
      const team2 = teams[1]?.team?.longName ?? teams[1]?.longName ?? teams[1]?.name ?? 'TBD'
      const venue = m.ground?.longName ?? m.venue ?? null
      const scheduledAt = m.startDate ?? m.startDateTime ?? null

      let status: 'upcoming' | 'live' | 'completed' = 'upcoming'
      const matchState = (m.matchStatus ?? m.state ?? '').toLowerCase()
      if (matchState.includes('complete') || matchState.includes('result')) status = 'completed'
      else if (matchState.includes('live') || matchState.includes('progress')) status = 'live'

      matchRows.push({
        match_number: parseInt(matchNumber),
        team1: abbreviateTeam(team1),
        team2: abbreviateTeam(team2),
        venue,
        scheduled_at: scheduledAt,
        status,
      })
    }
  }

  if (matchRows.length === 0) {
    return Response.json({ error: 'No matches found in ESPNcricinfo response. The series ID may be incorrect.', seriesId }, { status: 422 })
  }

  // Upsert matches
  const { error: matchErr } = await supabase
    .from('ipl_matches')
    .upsert(matchRows, { onConflict: 'match_number' })

  if (matchErr) return Response.json({ error: matchErr.message }, { status: 500 })

  // Auto-create gameweeks by grouping matches into calendar weeks (Mon–Sun)
  const { data: allMatches } = await supabase
    .from('ipl_matches')
    .select('id, scheduled_at, match_number')
    .not('scheduled_at', 'is', null)
    .order('scheduled_at')

  if (allMatches && allMatches.length > 0) {
    const weeks = new Map<string, { start: Date; end: Date; matchIds: string[]; firstMatch: Date }>()

    for (const match of allMatches) {
      const d = new Date(match.scheduled_at!)
      const monday = getMonday(d)
      const sunday = new Date(monday)
      sunday.setDate(sunday.getDate() + 6)
      const key = monday.toISOString().split('T')[0]

      if (!weeks.has(key)) {
        weeks.set(key, { start: monday, end: sunday, matchIds: [], firstMatch: d })
      }
      weeks.get(key)!.matchIds.push(match.id)
    }

    const weekEntries = Array.from(weeks.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    const gameweekRows = weekEntries.map(([, w], i) => ({
      week_number: i + 1,
      name: `Week ${i + 1}`,
      start_date: w.start.toISOString().split('T')[0],
      end_date: w.end.toISOString().split('T')[0],
      deadline: w.firstMatch.toISOString(), // locks at first match kickoff
      status: 'upcoming' as const,
    }))

    const { data: insertedWeeks, error: weekErr } = await supabase
      .from('gameweeks')
      .upsert(gameweekRows, { onConflict: 'week_number' })
      .select('id, week_number, start_date, end_date')

    if (weekErr) return Response.json({ error: weekErr.message }, { status: 500 })

    // Link matches to gameweeks
    if (insertedWeeks) {
      for (const [key, w] of weeks) {
        const weekNum = weekEntries.findIndex(([k]) => k === key) + 1
        const gw = insertedWeeks.find((g: any) => g.week_number === weekNum)
        if (gw) {
          await supabase
            .from('ipl_matches')
            .update({ gameweek_id: gw.id })
            .in('id', w.matchIds)
        }
      }
    }
  }

  return Response.json({
    success: true,
    matches_imported: matchRows.length,
    message: `Imported ${matchRows.length} matches and created gameweeks`,
  })
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

// Map full team names from ESPNcricinfo to IPL abbreviations
function abbreviateTeam(name: string): string {
  const map: Record<string, string> = {
    'Mumbai Indians': 'MI',
    'Chennai Super Kings': 'CSK',
    'Royal Challengers Bengaluru': 'RCB',
    'Royal Challengers Bangalore': 'RCB',
    'Kolkata Knight Riders': 'KKR',
    'Rajasthan Royals': 'RR',
    'Delhi Capitals': 'DC',
    'Punjab Kings': 'PBKS',
    'Sunrisers Hyderabad': 'SRH',
    'Lucknow Super Giants': 'LSG',
    'Gujarat Titans': 'GT',
  }
  return map[name] ?? name
}
