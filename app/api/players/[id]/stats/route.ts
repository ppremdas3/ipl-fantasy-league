import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch performances joined with match info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: perfs } = await (supabase as any)
    .from('player_performances')
    .select('fantasy_points, runs, wickets, ipl_matches(match_number, team1, team2)')
    .eq('player_id', id)
    .order('ipl_matches(match_number)')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const performances = (perfs ?? []).map((p: any) => {
    const match = Array.isArray(p.ipl_matches) ? p.ipl_matches[0] : p.ipl_matches
    return {
      match_number: match?.match_number ?? 0,
      opponent: match ? `M${match.match_number}` : '?',
      fantasy_points: p.fantasy_points ?? 0,
      runs: p.runs ?? 0,
      wickets: p.wickets ?? 0,
    }
  })

  return Response.json({ performances })
}
