/**
 * IPL Fantasy League — Schedule Sync Agent (Cricbuzz via RapidAPI)
 *
 * Fetches the full IPL 2026 series from Cricbuzz, inserts any missing matches,
 * and updates match statuses (upcoming / live / completed) in Supabase.
 *
 * ⚠️  REQUEST BUDGET: 200 req/month hard cap on RapidAPI free tier.
 *     Uses 1 request per run. Cache TTL: 6 hours.
 *     Expected usage: ~1 req at season start + ~1 req/day = ~50 req/season.
 *
 * Usage (from ipl-fantasy/ directory):
 *   npm run sync-schedule                  # sync (uses cache if fresh)
 *   npm run sync-schedule -- --force       # bypass cache, fetch live
 *   npm run sync-schedule -- --dry-run     # preview changes, no DB writes
 *   npm run sync-schedule -- --status      # show cache age + budget info
 *
 * Prerequisites — run once in Supabase SQL editor if not done yet:
 *   ALTER TABLE ipl_matches ADD COLUMN IF NOT EXISTS cricbuzz_match_id TEXT;
 *   CREATE UNIQUE INDEX IF NOT EXISTS ipl_matches_cricbuzz_id_idx ON ipl_matches(cricbuzz_match_id);
 */

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import { createClient } from '@supabase/supabase-js'

// ── Config ──────────────────────────────────────────────────────────────────

const CACHE_DIR       = path.join(__dirname, '.cricket-cache')
const SCHEDULE_CACHE  = path.join(CACHE_DIR, 'cricbuzz_series.json')
const BUDGET_LOG      = path.join(CACHE_DIR, 'api_request_log.json')
const CACHE_TTL_HOURS = 6
const MONTHLY_BUDGET  = 200
const IPL_SERIES_ID   = 9241

const TEAM_MAP: Record<string, string> = {
  'Royal Challengers Bengaluru':  'RCB',
  'Royal Challengers Bangalore':  'RCB',
  'Sunrisers Hyderabad':          'SRH',
  'Mumbai Indians':               'MI',
  'Kolkata Knight Riders':        'KKR',
  'Rajasthan Royals':             'RR',
  'Chennai Super Kings':          'CSK',
  'Punjab Kings':                 'PBKS',
  'Kings XI Punjab':              'PBKS',
  'Gujarat Titans':               'GT',
  'Lucknow Super Giants':         'LSG',
  'Delhi Capitals':               'DC',
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Args {
  force: boolean
  dryRun: boolean
  status: boolean
}

interface CricbuzzMatchInfo {
  matchId: number
  matchDesc: string       // "1st Match", "74th Match", etc.
  state: string           // "Upcoming" | "In Progress" | "Complete"
  status?: string         // result text when complete (e.g. "RCB won by 5 wkts")
  startDate: string       // unix ms as string
  team1: { teamSName: string; teamName: string }
  team2: { teamSName: string; teamName: string }
  venueInfo?: { ground: string; city: string }
}

interface MatchDetailsItem {
  matchDetailsMap?: {
    key: string
    match: { matchInfo: CricbuzzMatchInfo }[]
    seriesId: number
  }
}

interface SeriesResponse {
  matchDetails: MatchDetailsItem[]
}

interface CachedSeries {
  fetchedAt: number
  data: SeriesResponse
}

interface BudgetLog {
  month: string
  requests: number
  history: { ts: number; endpoint: string }[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  return {
    force:  argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
    status: argv.includes('--status'),
  }
}

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) { console.error('❌  .env.local not found'); process.exit(1) }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

function color(s: string, code: string) { return `\x1b[${code}m${s}\x1b[0m` }
const bold   = (s: string) => color(s, '1')
const cyan   = (s: string) => color(s, '36')
const green  = (s: string) => color(s, '32')
const yellow = (s: string) => color(s, '33')
const red    = (s: string) => color(s, '31')
const dim    = (s: string) => color(s, '2')

function loadBudgetLog(): BudgetLog {
  const month = new Date().toISOString().slice(0, 7)
  if (!fs.existsSync(BUDGET_LOG)) return { month, requests: 0, history: [] }
  const log: BudgetLog = JSON.parse(fs.readFileSync(BUDGET_LOG, 'utf8'))
  if (log.month !== month) return { month, requests: 0, history: [] }
  return log
}

function recordRequest(endpoint: string) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  const log = loadBudgetLog()
  log.requests++
  log.history.push({ ts: Date.now(), endpoint })
  fs.writeFileSync(BUDGET_LOG, JSON.stringify(log, null, 2))
}

function cacheAgeMinutes(cache: CachedSeries) {
  return Math.round((Date.now() - cache.fetchedAt) / 60000)
}

function isCacheFresh(cache: CachedSeries) {
  return (Date.now() - cache.fetchedAt) < CACHE_TTL_HOURS * 3600 * 1000
}

function cricbuzzGet(urlPath: string, apiKey: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'GET',
      hostname: 'cricbuzz-cricket.p.rapidapi.com',
      path: urlPath,
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
      },
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.end()
  })
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

function teamAbbr(teamName: string, teamSName: string): string {
  return TEAM_MAP[teamName] ?? teamSName
}

// ── Parsed match (from Cricbuzz) ──────────────────────────────────────────────

interface ParsedMatch {
  cricbuzzMatchId: string
  matchNumber: number
  team1: string
  team2: string
  scheduledAt: string    // ISO string
  venue: string | null
  status: 'upcoming' | 'live' | 'completed'
  result: string | null
}

function parseSeriesMatches(data: SeriesResponse): ParsedMatch[] {
  const matches: ParsedMatch[] = []
  for (const item of data.matchDetails ?? []) {
    if (!item.matchDetailsMap) continue
    for (const { matchInfo: m } of item.matchDetailsMap.match ?? []) {
      const matchNumber = parseMatchNumber(m.matchDesc)
      if (!matchNumber) continue
      matches.push({
        cricbuzzMatchId: String(m.matchId),
        matchNumber,
        team1:       teamAbbr(m.team1.teamName, m.team1.teamSName),
        team2:       teamAbbr(m.team2.teamName, m.team2.teamSName),
        scheduledAt: new Date(parseInt(m.startDate)).toISOString(),
        venue:       m.venueInfo ? `${m.venueInfo.ground}, ${m.venueInfo.city}` : null,
        status:      mapState(m.state),
        result:      m.status && mapState(m.state) === 'completed' ? m.status : null,
      })
    }
  }
  return matches
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs()
  loadEnv()

  const apiKey      = process.env.RAPIDAPI_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!apiKey)                     { console.error(red('❌  RAPIDAPI_KEY not set in .env.local')); process.exit(1) }
  if (!supabaseUrl || !serviceKey) { console.error(red('❌  Supabase env vars missing'));           process.exit(1) }

  const budget = loadBudgetLog()

  // ── --status mode ──
  if (args.status) {
    const remaining = MONTHLY_BUDGET - budget.requests
    console.log(bold('\n  Cricbuzz API Budget\n'))
    console.log(`  Month:      ${budget.month}`)
    console.log(`  Used:       ${budget.requests}/${MONTHLY_BUDGET}`)
    console.log(`  Remaining:  ${remaining < 20 ? red(String(remaining)) : green(String(remaining))}`)
    if (budget.history.length > 0) {
      console.log(`  Last call:  ${new Date(budget.history.at(-1)!.ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`)
    }
    if (fs.existsSync(SCHEDULE_CACHE)) {
      const cache: CachedSeries = JSON.parse(fs.readFileSync(SCHEDULE_CACHE, 'utf8'))
      const ageMin = cacheAgeMinutes(cache)
      const fresh  = isCacheFresh(cache)
      console.log(`  Cache age:  ${ageMin}m  ${fresh ? green('(fresh)') : yellow('(stale — next run will fetch)')}`)
    } else {
      console.log(`  Cache:      ${yellow('none — first run will fetch')}`)
    }
    console.log()
    return
  }

  const remaining = MONTHLY_BUDGET - budget.requests
  console.log()
  console.log(dim(`  Budget: ${budget.requests}/${MONTHLY_BUDGET} used (${remaining} remaining)`))

  // ── Load or fetch series data ──
  let seriesData: SeriesResponse

  const endpoint = `/series/v1/${IPL_SERIES_ID}`

  if (!args.force && fs.existsSync(SCHEDULE_CACHE)) {
    const existing: CachedSeries = JSON.parse(fs.readFileSync(SCHEDULE_CACHE, 'utf8'))
    if (isCacheFresh(existing)) {
      console.log(dim(`  Using cached series data (${cacheAgeMinutes(existing)}m old, TTL ${CACHE_TTL_HOURS}h). Pass --force to refresh.\n`))
      seriesData = existing.data
    } else {
      console.log(dim(`  Cache is ${cacheAgeMinutes(existing)}m old. Refreshing...\n`))
      if (remaining < 1) { console.error(red('❌  API budget exhausted.')); process.exit(1) }
      process.stdout.write(`  Fetching IPL 2026 series from Cricbuzz... `)
      seriesData = await cricbuzzGet(endpoint, apiKey) as SeriesResponse
      recordRequest(endpoint)
      console.log(green('✓'))
      fs.mkdirSync(CACHE_DIR, { recursive: true })
      fs.writeFileSync(SCHEDULE_CACHE, JSON.stringify({ fetchedAt: Date.now(), data: seriesData }, null, 2))
    }
  } else {
    if (remaining < 1) { console.error(red('❌  API budget exhausted.')); process.exit(1) }
    if (args.force) console.log(dim('  --force: bypassing cache.'))
    process.stdout.write(`  Fetching IPL 2026 series from Cricbuzz... `)
    seriesData = await cricbuzzGet(endpoint, apiKey) as SeriesResponse
    recordRequest(endpoint)
    console.log(green('✓'))
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(SCHEDULE_CACHE, JSON.stringify({ fetchedAt: Date.now(), data: seriesData }, null, 2))
  }

  // ── Parse Cricbuzz matches ──
  const cbMatches = parseSeriesMatches(seriesData)

  if (cbMatches.length === 0) {
    console.log(yellow('  No matches found in series response.'))
    return
  }

  console.log(dim(`  Found ${cbMatches.length} matches in IPL 2026 series\n`))

  // ── Load DB matches ──
  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: dbMatches, error } = await supabase
    .from('ipl_matches')
    .select('id, match_number, cricbuzz_match_id, team1, team2, scheduled_at, status, result')

  if (error) { console.error(red(`❌  DB read failed: ${error.message}`)); process.exit(1) }

  type DbMatch = {
    id: string; match_number: number; cricbuzz_match_id: string | null
    team1: string; team2: string; scheduled_at: string | null
    status: string; result: string | null
  }
  const existing = (dbMatches ?? []) as DbMatch[]
  const existingByMatchId = new Map(existing.filter(m => m.cricbuzz_match_id).map(m => [m.cricbuzz_match_id!, m]))
  const existingByNumber  = new Map(existing.map(m => [m.match_number, m]))

  // ── Diff ──
  const toInsert: typeof cbMatches = []
  const toUpdate: { dbId: string; matchNumber: number; patch: Record<string, unknown> }[] = []

  for (const cb of cbMatches) {
    // Find DB match: prefer cricbuzz_match_id lookup, fall back to match number
    const dbMatch = existingByMatchId.get(cb.cricbuzzMatchId) ?? existingByNumber.get(cb.matchNumber)

    if (!dbMatch) {
      toInsert.push(cb)
      continue
    }

    const patch: Record<string, unknown> = {}

    // Always store cricbuzz_match_id if not set yet
    if (!dbMatch.cricbuzz_match_id) patch.cricbuzz_match_id = cb.cricbuzzMatchId
    if (dbMatch.status !== cb.status) patch.status = cb.status
    if (cb.result && dbMatch.result !== cb.result) patch.result = cb.result

    if (Object.keys(patch).length > 0) {
      toUpdate.push({ dbId: dbMatch.id, matchNumber: dbMatch.match_number, patch })
    }
  }

  // ── Print summary ──
  console.log(bold(`  Schedule sync summary\n`))
  console.log(`  ${green(`${toInsert.length} new matches`)} to insert   ${cyan(`${toUpdate.length} existing matches`)} to update\n`)

  if (toInsert.length > 0) {
    console.log(dim('  New matches:'))
    for (const m of toInsert) {
      const ts = new Date(m.scheduledAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST'
      console.log(`    ${String(m.matchNumber).padStart(2)}. ${m.team1} vs ${m.team2}  ${dim(ts)}`)
    }
    console.log()
  }

  if (toUpdate.length > 0) {
    console.log(dim('  Updates:'))
    for (const u of toUpdate) {
      const changes = Object.entries(u.patch).map(([k, v]) => `${k}: ${cyan(String(v))}`).join(', ')
      console.log(`    Match #${u.matchNumber}: ${changes}`)
    }
    console.log()
  }

  if (args.dryRun) {
    console.log(yellow('  --dry-run: nothing written to DB.\n'))
    return
  }

  if (toInsert.length === 0 && toUpdate.length === 0) {
    console.log(green('  ✓ Everything is already up to date.\n'))
    return
  }

  // ── Insert new matches ──
  if (toInsert.length > 0) {
    const rows = toInsert.map(m => ({
      match_number:      m.matchNumber,
      cricbuzz_match_id: m.cricbuzzMatchId,
      team1:             m.team1,
      team2:             m.team2,
      scheduled_at:      m.scheduledAt,
      venue:             m.venue,
      status:            m.status,
    }))
    const { error: insertErr } = await supabase
      .from('ipl_matches')
      .upsert(rows, { onConflict: 'match_number' })
    if (insertErr) {
      console.error(red(`❌  Insert failed: ${insertErr.message}`))
    } else {
      console.log(green(`  ✓ Inserted ${toInsert.length} matches`))
    }
  }

  // ── Update existing matches ──
  let updated = 0
  for (const u of toUpdate) {
    const { error: updateErr } = await supabase
      .from('ipl_matches')
      .update(u.patch)
      .eq('id', u.dbId)
    if (updateErr) console.error(red(`  ❌  Update failed for match #${u.matchNumber}: ${updateErr.message}`))
    else updated++
  }
  if (updated > 0) console.log(green(`  ✓ Updated ${updated} matches`))

  // ── Auto-generate/update gameweeks for newly inserted matches ──
  if (toInsert.length > 0) {
    const { data: allMatches } = await supabase
      .from('ipl_matches')
      .select('id, scheduled_at, match_number, gameweek_id')
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
        name:        `Week ${i + 1}`,
        start_date:  w.start.toISOString().split('T')[0],
        end_date:    w.end.toISOString().split('T')[0],
        deadline:    w.firstMatch.toISOString(),
        status:      'upcoming' as const,
      }))

      const { data: insertedWeeks } = await supabase
        .from('gameweeks')
        .upsert(gameweekRows, { onConflict: 'week_number' })
        .select('id, week_number')

      if (insertedWeeks) {
        for (const [key, w] of weeks) {
          const weekNum = weekEntries.findIndex(([k]) => k === key) + 1
          const gw = insertedWeeks.find((g: { id: string; week_number: number }) => g.week_number === weekNum)
          if (gw) await supabase.from('ipl_matches').update({ gameweek_id: gw.id }).in('id', w.matchIds)
        }
        console.log(green(`  ✓ Gameweeks synced (${insertedWeeks.length} weeks)`))
      }
    }
  }

  console.log()
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day  = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

main().catch(err => {
  console.error(red(`\n❌  ${err.message}`))
  process.exit(1)
})
