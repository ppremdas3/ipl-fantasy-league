/**
 * IPL Fantasy League — Scorecard Fetch Agent (Cricbuzz via RapidAPI)
 *
 * Fetches a completed match scorecard from Cricbuzz, parses all batting /
 * bowling / fielding stats, matches players to your DB by name, calculates
 * fantasy points, and saves the results — replacing manual score entry entirely.
 *
 * ⚠️  1 API request per run. Budget is logged to agents/.cricket-cache/api_request_log.json
 *
 * Usage (from ipl-fantasy/ directory):
 *   # Find the Cricbuzz match ID first:
 *   npm run sync-schedule               # syncs and lists IPL matches with IDs
 *
 *   # Dry run — preview stats and points without touching DB
 *   npm run fetch-scorecard -- --match-id 122709 --dry-run
 *
 *   # Save performances to DB
 *   npm run fetch-scorecard -- --match-id 122709 --db-match-number 1
 *
 *   # Save + recalculate league member points
 *   npm run fetch-scorecard -- --match-id 122709 --db-match-number 1 --league-id <uuid>
 */

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import { createClient } from '@supabase/supabase-js'
import { calculatePoints } from '../lib/scoring/fantasy-points'

// ── Config ───────────────────────────────────────────────────────────────────

const CACHE_DIR      = path.join(__dirname, '.cricket-cache')
const BUDGET_LOG     = path.join(CACHE_DIR, 'api_request_log.json')
const PLAYER_ID_MAP  = path.join(CACHE_DIR, 'player-id-map.json')
const MONTHLY_BUDGET = 200

// ── Types ─────────────────────────────────────────────────────────────────────

interface Args {
  matchId: string | null
  dbMatchNumber: number | null   // legacy override; auto-detected via cricbuzz_match_id if not set
  leagueId: string | null
  dryRun: boolean
  debug: boolean
}

interface CricbuzzBatsman {
  id: number
  name: string
  runs: number
  balls: number
  fours: number
  sixes: number
  outdec: string         // dismissal text
  iskeeper: boolean
  iscaptain: boolean
}

interface CricbuzzBowler {
  id: number
  name: string
  balls: number          // total balls bowled (use this, not 'overs' string)
  maidens: number
  wickets: number
  runs: number           // runs conceded
}

interface CricbuzzInning {
  inningsid: number
  batteamsname: string
  batsman: CricbuzzBatsman[]
  bowler: CricbuzzBowler[]
}

interface CricbuzzScorecard {
  scorecard: CricbuzzInning[]
  ismatchcomplete: boolean
  status: string
}

interface DbPlayer {
  id: string
  name: string
  cricinfo_id: string | null
  cricbuzz_id: string | null
  ipl_team: string
  role: string
}

interface PlayerStats {
  // Batting
  runs: number
  ballsFaced: number
  fours: number
  sixes: number
  isDuck: boolean
  // Bowling
  oversBowled: number    // cricket decimal format e.g. 3.4 = 3 overs 4 balls
  runsConceded: number
  wickets: number
  maidens: number
  // Fielding
  catches: number
  stumpings: number
  runOutsDirect: number
  runOutsAssist: number
  // Meta
  didBat: boolean
  didBowl: boolean
  isPlayingXI: boolean
}

type DismissalKind = 'caught' | 'caught&bowled' | 'bowled' | 'lbw' | 'stumped' |
                     'runout' | 'hitwicket' | 'notout' | 'dnb'

interface Dismissal {
  kind: DismissalKind
  fielder1: string | null   // catcher / stumper / run-out fielder
  fielder2: string | null   // run-out second fielder (assist)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const args: Args = { matchId: null, dbMatchNumber: null, leagueId: null, dryRun: false, debug: false }
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--match-id':          args.matchId = argv[++i]; break
      case '--db-match-number':   args.dbMatchNumber = parseInt(argv[++i]); break
      case '--league-id':         args.leagueId = argv[++i]; break
      case '--dry-run':           args.dryRun = true; break
      case '--debug':             args.debug = true; break
    }
  }
  return args
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

// Balls → cricket decimal overs (3 overs 4 balls = 3.4)
function ballsToOvers(balls: number): number {
  return parseFloat(`${Math.floor(balls / 6)}.${balls % 6}`)
}

// ── Player ID map (cricbuzz_id → db_player_id) ───────────────────────────────

function loadPlayerIdMap(): Record<string, string> {
  if (!fs.existsSync(PLAYER_ID_MAP)) return {}
  try { return JSON.parse(fs.readFileSync(PLAYER_ID_MAP, 'utf8')) }
  catch { return {} }
}

function savePlayerIdMap(map: Record<string, string>) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(PLAYER_ID_MAP, JSON.stringify(map, null, 2))
}

// ── Budget tracking ───────────────────────────────────────────────────────────
function loadBudgetLog() {
  const month = new Date().toISOString().slice(0, 7)
  if (!fs.existsSync(BUDGET_LOG)) return { month, requests: 0, history: [] as { ts: number; endpoint: string }[] }
  const log = JSON.parse(fs.readFileSync(BUDGET_LOG, 'utf8'))
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

// ── Cricbuzz API ──────────────────────────────────────────────────────────────

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

// ── Dismissal Parser ──────────────────────────────────────────────────────────

function parseDismissal(outdec: string): Dismissal {
  if (!outdec || outdec.trim() === '') return { kind: 'dnb', fielder1: null, fielder2: null }
  const s = outdec.trim()
  const lower = s.toLowerCase()

  if (lower === 'not out') return { kind: 'notout', fielder1: null, fielder2: null }

  // c & b {bowler}  — caught and bowled, bowler is the fielder
  if (/^c\s*&\s*b\s+/i.test(s)) {
    const bowler = s.replace(/^c\s*&\s*b\s+/i, '').trim()
    return { kind: 'caught&bowled', fielder1: bowler, fielder2: null }
  }

  // c {fielder} b {bowler}
  // fielder may be prefixed with † (keeper symbol) or "sub (name)"
  const caughtMatch = s.match(/^c\s+(.*?)\s+b\s+\S/i)
  if (caughtMatch) {
    let fielder = caughtMatch[1].trim()
    fielder = fielder.replace(/^†/, '').trim()          // strip keeper marker
    fielder = fielder.replace(/^sub\s*\([^)]+\)/i, '').trim() // strip "sub (Name)" → empty if sub
    return { kind: 'caught', fielder1: fielder || null, fielder2: null }
  }

  // st {keeper} b {bowler}
  const stMatch = s.match(/^st\s+(.*?)\s+b\s+/i)
  if (stMatch) {
    let keeper = stMatch[1].trim().replace(/^†/, '').trim()
    return { kind: 'stumped', fielder1: keeper || null, fielder2: null }
  }

  // run out ({fielder}) or run out ({f1}/{f2}) or run out (absent)
  const roMatch = s.match(/^run\s+out\s*\((.+?)\)/i)
  if (roMatch) {
    const parts = roMatch[1].split('/').map(p => p.trim()).filter(p => p && p.toLowerCase() !== 'absent')
    return { kind: 'runout', fielder1: parts[0] ?? null, fielder2: parts[1] ?? null }
  }
  if (lower.startsWith('run out')) return { kind: 'runout', fielder1: null, fielder2: null }

  if (lower.startsWith('hit wicket'))       return { kind: 'hitwicket', fielder1: null, fielder2: null }
  if (/^b\s+/i.test(s))                     return { kind: 'bowled',    fielder1: null, fielder2: null }
  if (lower.startsWith('lbw'))              return { kind: 'lbw',       fielder1: null, fielder2: null }
  if (lower.startsWith('obstructing'))      return { kind: 'bowled',    fielder1: null, fielder2: null }
  if (lower.startsWith('handled'))          return { kind: 'bowled',    fielder1: null, fielder2: null }
  if (lower.startsWith('timed out'))        return { kind: 'bowled',    fielder1: null, fielder2: null }

  // Fallback — treat anything else as caught
  return { kind: 'caught', fielder1: null, fielder2: null }
}

// ── Name Matching ─────────────────────────────────────────────────────────────

function normName(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z\s]/g, '')   // strip non-alpha
    .replace(/\s+/g, ' ')
    .trim()
}

function matchPlayerByName(name: string, pool: DbPlayer[]): DbPlayer | null {
  if (!name) return null
  const n = normName(name)

  // 1. Exact normalised match
  let hit = pool.find(p => normName(p.name) === n)
  if (hit) return hit

  // 2. Pool player whose normalised name ends with the search term
  //    e.g. "Latham" matches "Tom Latham", "de Kock" matches "Quinton de Kock"
  const candidates = pool.filter(p => normName(p.name).endsWith(n))
  if (candidates.length === 1) return candidates[0]

  // 3. Search term ends with the last word(s) of pool player name
  //    e.g. "R Sharma" → last word "sharma" matches "Rohit Sharma"
  const lastName = n.split(' ').at(-1)!
  const lastNameHits = pool.filter(p => normName(p.name).split(' ').at(-1) === lastName)
  if (lastNameHits.length === 1) return lastNameHits[0]

  // 4. Every token in the search name appears in the pool name
  const tokens = n.split(' ')
  const tokenHits = pool.filter(p => tokens.every(tok => normName(p.name).includes(tok)))
  if (tokenHits.length === 1) return tokenHits[0]

  return null
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs()
  loadEnv()

  if (!args.matchId) {
    console.log(`\n${bold('Usage:')}`)
    console.log('  # 1. Find the Cricbuzz match ID for a completed IPL match:')
    console.log('  npm run sync-schedule -- --force\n')
    console.log('  # 2. Preview scorecard (no DB writes):')
    console.log('  npm run fetch-scorecard -- --match-id <cricbuzz_id> --dry-run\n')
    console.log('  # 3. Save performances + calculate points:')
    console.log('  npm run fetch-scorecard -- --match-id <cricbuzz_id> --league-id <uuid>\n')
    console.log('  # (DB match is auto-detected via cricbuzz_match_id — no --db-match-number needed after seeding)')
    process.exit(0)
  }

  const apiKey      = process.env.RAPIDAPI_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!apiKey)                    { console.error(red('❌  RAPIDAPI_KEY not in .env.local')); process.exit(1) }
  if (!supabaseUrl || !serviceKey){ console.error(red('❌  Supabase env vars missing'));       process.exit(1) }

  const budget = loadBudgetLog()
  const remaining = MONTHLY_BUDGET - budget.requests
  if (remaining < 1) {
    console.error(red(`❌  API budget exhausted (${budget.requests}/${MONTHLY_BUDGET} used this month)`))
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  // ── Fetch scorecard ──
  const endpoint = `/mcenter/v1/${args.matchId}/hscard`
  console.log()
  console.log(dim(`  Budget: ${budget.requests}/${MONTHLY_BUDGET} used (${remaining} remaining)`))
  process.stdout.write(`  Fetching scorecard from Cricbuzz (1 request)... `)

  const raw = await cricbuzzGet(endpoint, apiKey) as CricbuzzScorecard
  recordRequest(endpoint)
  console.log(green('✓'))

  if (!raw.scorecard?.length) {
    console.error(red('❌  No scorecard data returned. Match may not be complete yet.'))
    console.log(dim(`  Status: ${raw.status}`))
    process.exit(1)
  }

  console.log(dim(`  Match status: ${raw.status}`))
  if (!raw.ismatchcomplete) console.log(yellow('  ⚠  Match is not marked complete — stats may be partial'))
  console.log()

  // ── Fetch DB players ──
  const { data: dbPlayers } = await supabase.from('ipl_players').select('id, name, cricinfo_id, cricbuzz_id, ipl_team, role')
  const pool = (dbPlayers ?? []) as DbPlayer[]

  // Build a cricbuzz_id → db player lookup from the DB column (populated by sync-players agent)
  const dbCricbuzzIdMap = new Map<string, DbPlayer>()
  for (const p of pool) {
    if (p.cricbuzz_id) dbCricbuzzIdMap.set(p.cricbuzz_id, p)
  }

  // ── Find DB match — auto via cricbuzz_match_id, fallback to --db-match-number ──
  let dbMatchId: string | null = null
  let dbGameweekId: string | null = null

  // Try auto-lookup by cricbuzz_match_id first (populated by sync-schedule / seed route)
  const { data: autoMatch } = await supabase
    .from('ipl_matches')
    .select('id, gameweek_id, match_number, team1, team2')
    .eq('cricbuzz_match_id', args.matchId!)
    .maybeSingle()

  if (autoMatch) {
    dbMatchId    = autoMatch.id
    dbGameweekId = autoMatch.gameweek_id
    console.log(dim(`  DB match: #${autoMatch.match_number} — ${autoMatch.team1} vs ${autoMatch.team2} ${green('(auto-detected)')}`))
  } else if (args.dbMatchNumber !== null) {
    // Legacy fallback: --db-match-number
    const { data: dbMatch } = await supabase
      .from('ipl_matches')
      .select('id, gameweek_id, team1, team2')
      .eq('match_number', args.dbMatchNumber)
      .maybeSingle()

    if (!dbMatch) {
      console.log(yellow(`  ⚠  DB match #${args.dbMatchNumber} not found. Run "Load Schedule" in admin first.`))
      console.log(dim('     Stats will be previewed but not saved.\n'))
    } else {
      dbMatchId    = dbMatch.id
      dbGameweekId = dbMatch.gameweek_id
    }
  } else {
    console.log(yellow('  ⚠  No DB match found for this Cricbuzz match ID.'))
    console.log(dim('     Run "Load Schedule" in admin (or npm run sync-schedule) first.'))
    console.log(dim('     Stats will be previewed but not saved.\n'))
  }

  // ── Load persistent Cricbuzz ID → DB player ID map ──
  const persistentIdMap = loadPlayerIdMap()         // cricbuzzId (string) → db player uuid
  const cricbuzzIdByName = new Map<string, number>() // name → cricbuzz id (populated while parsing)
  let newMappings = 0

  // ── Parse each inning ──
  const statsMap = new Map<string, PlayerStats>()  // cricbuzz name → stats
  const playingXI = new Set<string>()              // all names that appeared in the scorecard
  const unmatchedFielders = new Set<string>()

  function getStats(name: string): PlayerStats {
    if (!statsMap.has(name)) {
      statsMap.set(name, {
        runs: 0, ballsFaced: 0, fours: 0, sixes: 0, isDuck: false,
        oversBowled: 0, runsConceded: 0, wickets: 0, maidens: 0,
        catches: 0, stumpings: 0, runOutsDirect: 0, runOutsAssist: 0,
        didBat: false, didBowl: false, isPlayingXI: false,
      })
    }
    return statsMap.get(name)!
  }

  for (const inning of raw.scorecard) {
    const teamName = inning.batteamsname

    // ── Batting ──
    for (const b of inning.batsman) {
      const name = b.name
      if (!name) continue
      if (b.id) cricbuzzIdByName.set(name, b.id)

      // "" outdec + 0 balls = didn't bat (XI listed but didn't come in)
      // We still count them as playing XI
      playingXI.add(name)
      const s = getStats(name)
      s.isPlayingXI = true

      if (b.balls === 0 && b.outdec === '') {
        // didn't bat — no batting stats but still mark as playing
        continue
      }

      s.didBat = true
      s.runs         += b.runs
      s.ballsFaced   += b.balls
      s.fours        += b.fours
      s.sixes        += b.sixes

      const dis = parseDismissal(b.outdec)

      // Duck: faced at least 1 ball, scored 0, got out
      if (b.runs === 0 && b.balls > 0 && dis.kind !== 'notout' && dis.kind !== 'dnb') {
        s.isDuck = true
      }

      // Fielding credit from dismissal
      if (dis.kind === 'caught' && dis.fielder1) {
        const fielder = getStats(dis.fielder1)
        fielder.catches++
        fielder.isPlayingXI = true
        playingXI.add(dis.fielder1)
        if (!matchPlayerByName(dis.fielder1, pool)) unmatchedFielders.add(dis.fielder1)
      }

      if (dis.kind === 'caught&bowled' && dis.fielder1) {
        // bowler gets both the wicket (handled in bowling section) AND the catch
        const bowlerSt = getStats(dis.fielder1)
        bowlerSt.catches++
      }

      if (dis.kind === 'stumped' && dis.fielder1) {
        const keeper = getStats(dis.fielder1)
        keeper.stumpings++
        keeper.isPlayingXI = true
        playingXI.add(dis.fielder1)
        if (!matchPlayerByName(dis.fielder1, pool)) unmatchedFielders.add(dis.fielder1)
      }

      if (dis.kind === 'runout') {
        if (dis.fielder1) {
          const f1 = getStats(dis.fielder1)
          f1.runOutsDirect++
          f1.isPlayingXI = true
          playingXI.add(dis.fielder1)
          if (!matchPlayerByName(dis.fielder1, pool)) unmatchedFielders.add(dis.fielder1)
        }
        if (dis.fielder2) {
          const f2 = getStats(dis.fielder2)
          f2.runOutsAssist++
          f2.isPlayingXI = true
          playingXI.add(dis.fielder2)
          if (!matchPlayerByName(dis.fielder2, pool)) unmatchedFielders.add(dis.fielder2)
        }
      }
    }

    // ── Bowling ──
    for (const bwl of inning.bowler) {
      const name = bwl.name
      if (!name) continue
      if (bwl.id) cricbuzzIdByName.set(name, bwl.id)
      playingXI.add(name)
      const s = getStats(name)
      s.isPlayingXI = true
      s.didBowl      = true
      s.oversBowled  += ballsToOvers(bwl.balls)   // accumulate across innings if bowled in both
      s.runsConceded += bwl.runs
      s.wickets      += bwl.wickets
      s.maidens      += bwl.maidens
    }
  }

  // ── Match players to DB ──
  interface MatchedPlayer {
    cricbuzzName: string
    dbPlayer: DbPlayer | null
    stats: PlayerStats
    fantasyPts: number
  }

  const results: MatchedPlayer[] = []
  const namesToProcess = [...statsMap.keys()]
    .filter(name => {
      const s = statsMap.get(name)!
      return s.didBat || s.didBowl || s.catches > 0 || s.stumpings > 0 ||
             s.runOutsDirect > 0 || s.runOutsAssist > 0
    })

  for (const name of namesToProcess) {
    const stats = statsMap.get(name)!
    const cricbuzzId = cricbuzzIdByName.get(name)
    const cachedDbId = cricbuzzId ? persistentIdMap[String(cricbuzzId)] : undefined

    let dbPlayer: DbPlayer | null = null
    if (cricbuzzId && dbCricbuzzIdMap.has(String(cricbuzzId))) {
      // Best: exact match via cricbuzz_id column in DB (populated by sync-players agent)
      dbPlayer = dbCricbuzzIdMap.get(String(cricbuzzId))!
    } else if (cachedDbId) {
      // Good: exact match via local player-id-map.json cache
      dbPlayer = pool.find(p => p.id === cachedDbId) ?? null
    } else {
      // Fallback: fuzzy name matching; save the mapping for next time
      dbPlayer = matchPlayerByName(name, pool)
      if (dbPlayer && cricbuzzId) {
        persistentIdMap[String(cricbuzzId)] = dbPlayer.id
        newMappings++
      }
    }

    const fantasyPts = calculatePoints({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(dbPlayer ? { player_id: dbPlayer.id, match_id: dbMatchId ?? '' } : {} as any),
      runs: stats.runs,
      balls_faced: stats.ballsFaced,
      fours: stats.fours,
      sixes: stats.sixes,
      is_duck: stats.isDuck,
      wickets: stats.wickets,
      overs_bowled: stats.oversBowled,
      runs_conceded: stats.runsConceded,
      maidens: stats.maidens,
      catches: stats.catches,
      stumpings: stats.stumpings,
      run_outs_direct: stats.runOutsDirect,
      run_outs_assist: stats.runOutsAssist,
      is_playing_xi: stats.isPlayingXI,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    results.push({ cricbuzzName: name, dbPlayer, stats, fantasyPts })
  }

  results.sort((a, b) => b.fantasyPts - a.fantasyPts)

  // ── Print results table ──
  const matched   = results.filter(r => r.dbPlayer)
  const unmatched = results.filter(r => !r.dbPlayer)

  console.log(bold(`  Scorecard — ${raw.status}\n`))
  console.log(
    dim('  Player              DB match?    R   B  4s  6s  Dk   W   Ov  RC  Md  Ct  St  RO  ') +
    bold('Pts')
  )
  console.log(dim('  ' + '─'.repeat(102)))

  for (const r of results) {
    const { stats: s } = r
    const name     = (r.dbPlayer?.name ?? r.cricbuzzName).slice(0, 18).padEnd(19)
    const dbMark   = r.dbPlayer ? green('✓') : red('✗')
    const ov       = s.oversBowled.toFixed(1).padStart(5)
    const pts      = r.fantasyPts.toString().padStart(4)
    const nameCol  = r.dbPlayer ? (x: string) => x : dim
    const ptsCol   = r.fantasyPts >= 50 ? green : r.fantasyPts >= 25 ? cyan : r.fantasyPts < 0 ? red : (x: string) => x

    console.log(
      `  ${nameCol(name)} ${dbMark}           ` +
      `${String(s.runs).padStart(3)} ` +
      `${String(s.ballsFaced).padStart(3)} ` +
      `${String(s.fours).padStart(3)} ` +
      `${String(s.sixes).padStart(3)} ` +
      `${s.isDuck ? red(' Y') : dim(' N')}  ` +
      `${String(s.wickets).padStart(3)} ` +
      `${ov} ` +
      `${String(s.runsConceded).padStart(3)} ` +
      `${String(s.maidens).padStart(3)} ` +
      `${String(s.catches).padStart(3)} ` +
      `${String(s.stumpings).padStart(3)} ` +
      `${String(s.runOutsDirect + s.runOutsAssist).padStart(3)}  ` +
      `${ptsCol(pts)}`
    )
  }

  // Save any new cricbuzz ID → db player mappings we learned this run
  if (newMappings > 0) {
    savePlayerIdMap(persistentIdMap)
  }

  console.log(dim('\n  ' + '─'.repeat(102)))
  const totalPts = matched.reduce((s, r) => s + r.fantasyPts, 0)
  const idCacheSize = Object.keys(persistentIdMap).length
  console.log(`  ${green(`${matched.length} matched`)}   ${red(`${unmatched.length} unmatched`)}   ${bold('Total pts (matched):')} ${cyan(totalPts.toFixed(1))}`)
  if (newMappings > 0) console.log(dim(`  ${newMappings} new Cricbuzz ID mappings cached (${idCacheSize} total in player-id-map.json)`))

  if (unmatched.length > 0) {
    console.log(yellow(`\n  ✗ Unmatched (not in your player DB):`))
    for (const r of unmatched) console.log(dim(`    · ${r.cricbuzzName}`))
    console.log(dim('    Add these players to ipl_players to include them.\n'))
  }

  if (unmatchedFielders.size > 0 && args.debug) {
    console.log(dim(`\n  [debug] Fielder names in outdec strings that had no DB match:`))
    for (const f of unmatchedFielders) console.log(dim(`    · ${f}`))
  }

  // ── Dry run stops here ──
  if (args.dryRun) {
    console.log(yellow('\n  --dry-run: nothing written to DB.\n'))
    return
  }

  if (!dbMatchId) {
    console.log(yellow('\n  No --db-match-number given (or match not found in DB). Stats not saved.'))
    console.log(dim('  Run "Load Schedule" in admin, then add --db-match-number <n>\n'))
    return
  }

  if (matched.length === 0) {
    console.log(yellow('\n  No players matched to DB. Nothing to save.\n'))
    return
  }

  // ── Upsert player_performances ──
  console.log(`\n  Saving ${matched.length} performances to DB...`)

  const rows = matched.map(r => ({
    match_id: dbMatchId!,
    player_id: r.dbPlayer!.id,
    runs: r.stats.runs,
    balls_faced: r.stats.ballsFaced,
    fours: r.stats.fours,
    sixes: r.stats.sixes,
    is_duck: r.stats.isDuck,
    wickets: r.stats.wickets,
    overs_bowled: r.stats.oversBowled,
    runs_conceded: r.stats.runsConceded,
    maidens: r.stats.maidens,
    catches: r.stats.catches,
    stumpings: r.stats.stumpings,
    run_outs_direct: r.stats.runOutsDirect,
    run_outs_assist: r.stats.runOutsAssist,
    is_playing_xi: true,
    fantasy_points: r.fantasyPts,
  }))

  const { error: upsertErr } = await supabase
    .from('player_performances')
    .upsert(rows, { onConflict: 'match_id,player_id' })

  if (upsertErr) {
    console.error(red(`❌  DB upsert failed: ${upsertErr.message}`))
    process.exit(1)
  }
  console.log(green(`  ✓ ${rows.length} performances saved`))

  // ── Mark match as completed in DB ──
  await supabase
    .from('ipl_matches')
    .update({ status: 'completed', result: raw.status })
    .eq('id', dbMatchId)
  console.log(green('  ✓ Match status updated to completed'))

  // ── Recalculate member points ──
  if (!args.leagueId) {
    console.log(dim('\n  Tip: add --league-id <uuid> to update member leaderboard points.\n'))
    return
  }

  if (!dbGameweekId) {
    console.log(yellow('\n  ⚠  Match has no gameweek_id. Run "Generate Gameweeks" in admin first.\n'))
    return
  }

  const playerPtsMap = new Map(matched.map(r => [r.dbPlayer!.id, r.fantasyPts]))

  const { data: members } = await supabase
    .from('league_members')
    .select('id, team_name, total_points')
    .eq('league_id', args.leagueId)

  if (!members?.length) { console.log(yellow('\n  No members found for this league.\n')); return }

  console.log('\n  Updating member points...')
  let updated = 0

  for (const member of members) {
    const { data: selections } = await supabase
      .from('weekly_selections')
      .select('player_id, is_captain, is_vice_captain')
      .eq('league_id', args.leagueId)
      .eq('member_id', member.id)
      .eq('gameweek_id', dbGameweekId)

    if (!selections?.length) continue

    let matchPts = 0
    for (const sel of selections) {
      const rawPts = playerPtsMap.get(sel.player_id) ?? 0
      const mult   = sel.is_captain ? 2 : sel.is_vice_captain ? 1.5 : 1
      matchPts    += rawPts * mult
    }

    const newTotal = Number(member.total_points) + matchPts
    await supabase.from('league_members').update({ total_points: newTotal }).eq('id', member.id)

    const sign = matchPts >= 0 ? '+' : ''
    console.log(`    ${green('·')} ${(member.team_name ?? 'Unnamed').padEnd(20)} ${sign}${matchPts.toFixed(1)} pts  →  ${newTotal.toFixed(1)} total`)
    updated++
  }

  console.log(green(`\n  ✓ ${updated}/${members.length} member totals updated\n`))
}

main().catch(err => {
  console.error(red(`\n❌  ${err.message}`))
  if (process.env.DEBUG) console.error(err.stack)
  process.exit(1)
})
