import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// IPL 2026 Schedule — Part 1 (Matches 1–20)
// All times converted to UTC (IST = UTC+5:30)
// 7:30 PM IST = 14:00 UTC | 3:30 PM IST = 10:00 UTC
const IPL_2026_MATCHES = [
  { match_number: 1,  team1: 'RCB',  team2: 'SRH',  scheduled_at: '2026-03-28T14:00:00Z', venue: 'Bengaluru' },
  { match_number: 2,  team1: 'MI',   team2: 'KKR',  scheduled_at: '2026-03-29T14:00:00Z', venue: 'Mumbai' },
  { match_number: 3,  team1: 'RR',   team2: 'CSK',  scheduled_at: '2026-03-30T14:00:00Z', venue: 'Guwahati' },
  { match_number: 4,  team1: 'PBKS', team2: 'GT',   scheduled_at: '2026-03-31T14:00:00Z', venue: 'New Chandigarh' },
  { match_number: 5,  team1: 'LSG',  team2: 'DC',   scheduled_at: '2026-04-01T14:00:00Z', venue: 'Lucknow' },
  { match_number: 6,  team1: 'KKR',  team2: 'SRH',  scheduled_at: '2026-04-02T14:00:00Z', venue: 'Kolkata' },
  { match_number: 7,  team1: 'CSK',  team2: 'PBKS', scheduled_at: '2026-04-03T14:00:00Z', venue: 'Chennai' },
  { match_number: 8,  team1: 'DC',   team2: 'MI',   scheduled_at: '2026-04-04T10:00:00Z', venue: 'Delhi' },
  { match_number: 9,  team1: 'GT',   team2: 'RR',   scheduled_at: '2026-04-04T14:00:00Z', venue: 'Ahmedabad' },
  { match_number: 10, team1: 'SRH',  team2: 'LSG',  scheduled_at: '2026-04-05T10:00:00Z', venue: 'Hyderabad' },
  { match_number: 11, team1: 'RCB',  team2: 'CSK',  scheduled_at: '2026-04-05T14:00:00Z', venue: 'Bengaluru' },
  { match_number: 12, team1: 'KKR',  team2: 'PBKS', scheduled_at: '2026-04-06T14:00:00Z', venue: 'Kolkata' },
  { match_number: 13, team1: 'RR',   team2: 'MI',   scheduled_at: '2026-04-07T14:00:00Z', venue: 'Guwahati' },
  { match_number: 14, team1: 'DC',   team2: 'GT',   scheduled_at: '2026-04-08T14:00:00Z', venue: 'Delhi' },
  { match_number: 15, team1: 'KKR',  team2: 'LSG',  scheduled_at: '2026-04-09T14:00:00Z', venue: 'Kolkata' },
  { match_number: 16, team1: 'RR',   team2: 'RCB',  scheduled_at: '2026-04-10T14:00:00Z', venue: 'Guwahati' },
  { match_number: 17, team1: 'PBKS', team2: 'SRH',  scheduled_at: '2026-04-11T10:00:00Z', venue: 'New Chandigarh' },
  { match_number: 18, team1: 'CSK',  team2: 'DC',   scheduled_at: '2026-04-11T14:00:00Z', venue: 'Chennai' },
  { match_number: 19, team1: 'LSG',  team2: 'GT',   scheduled_at: '2026-04-12T10:00:00Z', venue: 'Lucknow' },
  { match_number: 20, team1: 'MI',   team2: 'RCB',  scheduled_at: '2026-04-12T14:00:00Z', venue: 'Mumbai' },
]

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

  const rows = IPL_2026_MATCHES.map(m => ({ ...m, status: 'upcoming' as const }))

  const { error } = await supabase
    .from('ipl_matches')
    .upsert(rows, { onConflict: 'match_number' })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Auto-generate gameweeks after seeding
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
      if (!weeks.has(key)) weeks.set(key, { start: monday, end: sunday, matchIds: [], firstMatch: d })
      weeks.get(key)!.matchIds.push(match.id)
    }

    const weekEntries = Array.from(weeks.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    const gameweekRows = weekEntries.map(([, w], i) => ({
      week_number: i + 1,
      name: `Week ${i + 1}`,
      start_date: w.start.toISOString().split('T')[0],
      end_date: w.end.toISOString().split('T')[0],
      deadline: w.firstMatch.toISOString(),
      status: 'upcoming' as const,
    }))

    const { data: insertedWeeks, error: weekErr } = await supabase
      .from('gameweeks')
      .upsert(gameweekRows, { onConflict: 'week_number' })
      .select('id, week_number')

    if (!weekErr && insertedWeeks) {
      for (const [key, w] of weeks) {
        const weekNum = weekEntries.findIndex(([k]) => k === key) + 1
        const gw = insertedWeeks.find((g: { id: string; week_number: number }) => g.week_number === weekNum)
        if (gw) await supabase.from('ipl_matches').update({ gameweek_id: gw.id }).in('id', w.matchIds)
      }
    }
  }

  return Response.json({
    success: true,
    matches_seeded: rows.length,
    message: `Seeded ${rows.length} matches and generated gameweeks`,
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
