import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

  // Fetch all matches that have a scheduled_at
  const { data: allMatches } = await supabase
    .from('ipl_matches')
    .select('id, scheduled_at, match_number')
    .not('scheduled_at', 'is', null)
    .order('scheduled_at')

  if (!allMatches || allMatches.length === 0) {
    return Response.json({ error: 'No matches with dates found. Add matches first.' }, { status: 422 })
  }

  // Group by Mon–Sun calendar week
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
    deadline: w.firstMatch.toISOString(),
    status: 'upcoming' as const,
  }))

  const { data: insertedWeeks, error: weekErr } = await supabase
    .from('gameweeks')
    .upsert(gameweekRows, { onConflict: 'week_number' })
    .select('id, week_number')

  if (weekErr) return Response.json({ error: weekErr.message }, { status: 500 })

  // Link matches to their gameweeks
  if (insertedWeeks) {
    for (const [key, w] of weeks) {
      const weekNum = weekEntries.findIndex(([k]) => k === key) + 1
      const gw = insertedWeeks.find((g: { id: string; week_number: number }) => g.week_number === weekNum)
      if (gw) {
        await supabase.from('ipl_matches').update({ gameweek_id: gw.id }).in('id', w.matchIds)
      }
    }
  }

  return Response.json({
    success: true,
    gameweeks_created: gameweekRows.length,
    message: `Created ${gameweekRows.length} gameweeks from ${allMatches.length} matches`,
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
