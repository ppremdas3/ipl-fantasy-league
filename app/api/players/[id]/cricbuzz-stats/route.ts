import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? ''
const RAPIDAPI_HOST = 'cricbuzz-cricket.p.rapidapi.com'

async function fetchCricbuzz(path: string) {
  const res = await fetch(`https://${RAPIDAPI_HOST}${path}`, {
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST,
    },
  })
  if (!res.ok) return null
  return res.json()
}

// Response format:
//   headers: ["ROWHEADER", "Test", "ODI", "T20", "IPL"]
//   values:  [{ values: ["Matches", "0", "0", "14", "22"] }, ...]
// Index map after slice(1): 0=Test, 1=ODI, 2=T20, 3=IPL

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStatMap(raw: any): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const row of raw?.values ?? []) {
    const v = row.values ?? []
    if (v[0]) map[v[0]] = v.slice(1)
  }
  return map
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBatting(raw: any) {
  const s = buildStatMap(raw)
  const get = (stat: string, col: number) => s[stat]?.[col] ?? '0'
  return [{ label: 'T20', col: 2 }, { label: 'IPL', col: 3 }]
    .filter(f => parseInt(get('Matches', f.col)) > 0)
    .map(f => ({
      format:   f.label,
      matches:  get('Matches',  f.col),
      innings:  get('Innings',  f.col),
      runs:     get('Runs',     f.col),
      hs:       get('Highest',  f.col),
      avg:      get('Average',  f.col),
      sr:       get('SR',       f.col),
      fifties:  get('50s',      f.col),
      hundreds: get('100s',     f.col),
      fours:    get('Fours',    f.col),
      sixes:    get('Sixes',    f.col),
    }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBowling(raw: any) {
  const s = buildStatMap(raw)
  const get = (stat: string, col: number) => s[stat]?.[col] ?? '0'
  return [{ label: 'T20', col: 2 }, { label: 'IPL', col: 3 }]
    .filter(f => parseInt(get('Matches', f.col)) > 0)
    .map(f => ({
      format:  f.label,
      matches: get('Matches',  f.col),
      innings: get('Innings',  f.col),
      wickets: get('Wickets',  f.col),
      runs:    get('Runs',     f.col),
      economy: get('Economy',  f.col),
      avg:     get('Average',  f.col),
      sr:      get('SR',       f.col),
      best:    get('Best',     f.col),
      fiveW:   get('5 Wkts',   f.col),
    }))
}

export async function GET(
  _req: NextRequest,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: player } = await (supabase as any)
    .from('ipl_players')
    .select('cricbuzz_id, cricbuzz_stats')
    .eq('id', id)
    .maybeSingle()

  if (!player?.cricbuzz_id) {
    return Response.json({ batting: [], bowling: [], error: 'No Cricbuzz ID for this player' })
  }

  // Return cached stats if available — no API call needed
  if (player.cricbuzz_stats) {
    return Response.json(player.cricbuzz_stats)
  }

  // First time: fetch from Cricbuzz, parse, save to DB
  const cid = player.cricbuzz_id
  const [battingRaw, bowlingRaw] = await Promise.all([
    fetchCricbuzz(`/stats/v1/player/${cid}/batting`),
    fetchCricbuzz(`/stats/v1/player/${cid}/bowling`),
  ])

  const result = {
    batting: parseBatting(battingRaw),
    bowling: parseBowling(bowlingRaw),
  }

  // Persist to DB so subsequent requests are free
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('ipl_players')
    .update({ cricbuzz_stats: result })
    .eq('id', id)

  return Response.json(result)
}
