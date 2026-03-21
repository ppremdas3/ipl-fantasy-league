/**
 * IPL Fantasy League — Player Career Stats Sync
 *
 * Fetches T20/IPL batting + bowling career stats from Cricbuzz for every
 * player that has a cricbuzz_id, and stores them in ipl_players.cricbuzz_stats.
 *
 * After this runs once, the app reads stats from DB — zero API calls per visit.
 *
 * ⚠️  Uses 2 API requests per player (batting + bowling). With ~150 players
 *     that is ~300 requests. Run in batches using --limit if near budget cap.
 *
 * Usage (from ipl-fantasy/ directory):
 *   npm run sync-stats               # fetch all players
 *   npm run sync-stats -- --limit 20 # fetch first 20 (to stay within budget)
 *   npm run sync-stats -- --force    # re-fetch even players that already have stats
 *
 * Prerequisites:
 *   ALTER TABLE ipl_players ADD COLUMN IF NOT EXISTS cricbuzz_stats JSONB;
 */

import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY  ?? ''
const RAPIDAPI_HOST = 'cricbuzz-cricket.p.rapidapi.com'
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

const CACHE_DIR = path.join(__dirname, '.cricket-cache')
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })

const args  = process.argv.slice(2)
const LIMIT = (() => { const i = args.indexOf('--limit'); return i !== -1 ? parseInt(args[i + 1]) : Infinity })()
const FORCE = args.includes('--force')
const DEBUG = args.includes('--debug')

// ── HTTP helper ───────────────────────────────────────────────────────────────

function get(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: RAPIDAPI_HOST,
      path,
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    }
    const req = https.request(options, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch { reject(new Error('JSON parse error')) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── Parsers ───────────────────────────────────────────────────────────────────
// Response format:
//   headers: ["ROWHEADER", "Test", "ODI", "T20", "IPL"]
//   values:  [{ values: ["Matches", "0", "0", "14", "22"] }, ...]
// Index map: 1=Test, 2=ODI, 3=T20, 4=IPL

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStatMap(raw: any): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const row of raw?.values ?? []) {
    const v = row.values ?? []
    if (v[0]) map[v[0]] = v.slice(1) // { "Matches": ["0","0","14","22"], ... }
  }
  return map
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBatting(raw: any) {
  const s = buildStatMap(raw)
  const get = (stat: string, col: number) => s[stat]?.[col] ?? '0'

  // Only include a format if the player has at least 1 match in it
  const formats = [
    { label: 'T20', col: 2 },
    { label: 'IPL', col: 3 },
  ]

  return formats
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

  const formats = [
    { label: 'T20', col: 2 },
    { label: 'IPL', col: 3 },
  ]

  return formats
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Fetch all players that have a cricbuzz_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: players, error } = await (supabase as any)
    .from('ipl_players')
    .select('id, name, cricbuzz_id, cricbuzz_stats')
    .not('cricbuzz_id', 'is', null)
    .order('name')

  if (error) { console.error('DB read failed:', error.message); process.exit(1) }

  const total = (players ?? []).length
  console.log(`\n📋 ${total} players with cricbuzz_id found`)

  const toFetch = (players ?? []).filter((p: { cricbuzz_stats: unknown }) => FORCE || !p.cricbuzz_stats)
  const limited  = toFetch.slice(0, LIMIT === Infinity ? toFetch.length : LIMIT)

  if (!FORCE && toFetch.length < total) {
    console.log(`✓  ${total - toFetch.length} already have stats cached — skipping (use --force to re-fetch)`)
  }
  console.log(`🔄 Fetching stats for ${limited.length} players (2 API calls each = ${limited.length * 2} calls)\n`)

  let saved = 0, failed = 0, apiCalls = 0

  for (const player of limited) {
    process.stdout.write(`  ${player.name.padEnd(28)} `)

    try {
      const [battingRaw, bowlingRaw] = await Promise.all([
        get(`/stats/v1/player/${player.cricbuzz_id}/batting`),
        get(`/stats/v1/player/${player.cricbuzz_id}/bowling`),
      ])
      apiCalls += 2

      if (DEBUG) {
        console.log('\n── RAW BATTING (full) ──')
        console.log(JSON.stringify(battingRaw, null, 2))
        console.log('\n── RAW BOWLING (full) ──')
        console.log(JSON.stringify(bowlingRaw, null, 2))
        process.exit(0)
      }

      const stats = {
        batting: parseBatting(battingRaw),
        bowling: parseBowling(bowlingRaw),
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upErr } = await (supabase as any)
        .from('ipl_players')
        .update({ cricbuzz_stats: stats })
        .eq('id', player.id)

      if (upErr) throw new Error(upErr.message)

      const b = stats.batting.length, bw = stats.bowling.length
      console.log(`✓  ${b} batting rows, ${bw} bowling rows`)
      saved++
    } catch (e) {
      console.log(`✗  ${(e as Error).message}`)
      failed++
    }

    // Be gentle: 300ms between players to avoid rate-limit errors
    await sleep(300)
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`✅ Saved:   ${saved} players`)
  if (failed > 0) console.log(`❌ Failed:  ${failed} players`)
  console.log(`📡 API calls used: ${apiCalls}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
