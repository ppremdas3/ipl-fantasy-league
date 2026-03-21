/**
 * IPL Fantasy League — Match Score Fetcher Agent
 *
 * Fetches completed IPL match data from Cricsheet (open cricket data),
 * maps players via their ESPNcricinfo IDs, calculates fantasy points,
 * and optionally saves to the Supabase database.
 *
 * Data source: https://cricsheet.org — ball-by-ball data for all IPL matches.
 * Player mapping: Cricsheet people registry (key_cricinfo → our cricinfo_id field).
 *
 * NOTE: The ESPNcricinfo consumer API used in the Next.js app is blocked by Akamai
 * WAF when called from server scripts (non-browser TLS fingerprint). Cricsheet
 * provides the same data in open JSON format without any authentication.
 *
 * Usage (run from ipl-fantasy/ directory):
 *   npx tsx agents/fetch-match-scores.ts --list
 *   npx tsx agents/fetch-match-scores.ts --list --from-db
 *   npx tsx agents/fetch-match-scores.ts --match-id 1485779 --dry-run
 *   npx tsx agents/fetch-match-scores.ts --match-id 1473511 --league-id <uuid>
 *   npx tsx agents/fetch-match-scores.ts --latest
 *
 * Options:
 *   --match-id <id>      Cricsheet/ESPN match ID (the JSON filename number)
 *   --latest             Use the most recent IPL match in the dataset
 *   --season <year>      Season to filter when using --latest (default: 2025)
 *   --list               List available matches from Cricsheet (completed) and exit
 *   --from-db            With --list: show live schedule from your Supabase DB instead
 *   --league-id <id>     Supabase league ID — triggers points recalculation
 *   --dry-run            Preview stats without writing to DB
 *   --refresh-cache      Force re-download of Cricsheet data
 *   --debug              Verbose output
 */

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { calculatePoints } from '../lib/scoring/fantasy-points'

// ── Config ─────────────────────────────────────────────────────────────────

const CRICSHEET_IPL_ZIP  = 'https://cricsheet.org/downloads/ipl_json.zip'
const CRICSHEET_PEOPLE   = 'https://cricsheet.org/register/people.csv'
const CACHE_DIR          = path.join(__dirname, '.cricket-cache')
const ZIP_PATH           = path.join(CACHE_DIR, 'ipl_json.zip')
const PEOPLE_PATH        = path.join(CACHE_DIR, 'people.csv')
const EXTRACT_DIR        = path.join(CACHE_DIR, 'ipl_json')
const INDEX_PATH         = path.join(CACHE_DIR, 'matches_index.json')
const CACHE_MAX_AGE_DAYS = 1  // re-download if older than 1 day

// Team name to abbreviation mapping (same as the app)
const TEAM_ABBREV: Record<string, string> = {
  'Mumbai Indians': 'MI',
  'Chennai Super Kings': 'CSK',
  'Royal Challengers Bengaluru': 'RCB',
  'Royal Challengers Bangalore': 'RCB',
  'Kolkata Knight Riders': 'KKR',
  'Rajasthan Royals': 'RR',
  'Delhi Capitals': 'DC',
  'Punjab Kings': 'PBKS',
  'Kings XI Punjab': 'PBKS',
  'Sunrisers Hyderabad': 'SRH',
  'Lucknow Super Giants': 'LSG',
  'Gujarat Titans': 'GT',
  'Rising Pune Supergiant': 'RPS',
  'Rising Pune Supergiants': 'RPS',
  'Delhi Daredevils': 'DC',
  'Gujarat Lions': 'GL',
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Args {
  matchId?: string
  latest: boolean
  season: string
  list: boolean
  fromDb: boolean
  leagueId?: string
  dryRun: boolean
  refreshCache: boolean
  debug: boolean
}

interface MatchIndex {
  id: string
  season: string
  date: string
  teams: string[]
  teamAbbrevs: string[]
  matchNumber: number | null
}

interface PlayerPerf {
  // Batting
  runs: number
  ballsFaced: number
  fours: number
  sixes: number
  isDuck: boolean
  // Bowling
  legalDeliveries: number  // converted to overs later
  runsConceded: number
  wickets: number
  maidenOvers: number
  // Fielding
  catches: number
  stumpings: number
  runOutsDirect: number
  runOutsAssist: number
  // Meta
  didBat: boolean
  didBowl: boolean
}

interface CricsheetMatch {
  meta: { data_version: string }
  info: {
    balls_per_over: number
    dates: string[]
    event?: { name: string; match_number?: number }
    season: string
    teams: string[]
    toss: { winner: string; decision: string }
    outcome?: { winner?: string; result?: string; by?: Record<string, number> }
    registry: { people: Record<string, string> }
    players: Record<string, string[]>
  }
  innings: Array<{
    team: string
    overs: Array<{
      over: number
      deliveries: Array<{
        batter: string
        bowler: string
        non_striker: string
        runs: { batter: number; extras: number; total: number }
        extras?: { wides?: number; noballs?: number; byes?: number; legbyes?: number }
        wickets?: Array<{
          kind: string
          player_out: string
          fielders?: Array<{ name: string; substitute?: boolean }>
        }>
      }>
    }>
  }>
}

// ── Argument Parsing ────────────────────────────────────────────────────────

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const args: Args = {
    latest: false,
    season: '2025',
    list: false,
    fromDb: false,
    dryRun: false,
    refreshCache: false,
    debug: false,
  }
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--match-id':     args.matchId = argv[++i]; break
      case '--latest':       args.latest = true; break
      case '--season':       args.season = argv[++i]; break
      case '--list':         args.list = true; break
      case '--from-db':      args.fromDb = true; break
      case '--league-id':    args.leagueId = argv[++i]; break
      case '--dry-run':      args.dryRun = true; break
      case '--refresh-cache':args.refreshCache = true; break
      case '--debug':        args.debug = true; break
    }
  }
  return args
}

// ── Env Loading ─────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('❌  .env.local not found at', envPath)
    process.exit(1)
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'IPLFantasyAgent/1.0 (cricsheet.org data)' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise(r => setTimeout(r, 1000 * attempt))
    }
  }
  throw new Error('unreachable')
}

function isCacheStale(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return true
  const stat = fs.statSync(filePath)
  const ageMs = Date.now() - stat.mtimeMs
  return ageMs > CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
}

// ── Cache Management ────────────────────────────────────────────────────────

async function ensureCache(forceRefresh: boolean, debug: boolean) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })

  // Download people.csv
  if (forceRefresh || isCacheStale(PEOPLE_PATH)) {
    console.log('⬇  Downloading player registry from Cricsheet...')
    const res = await fetchWithRetry(CRICSHEET_PEOPLE)
    fs.writeFileSync(PEOPLE_PATH, await res.text())
    console.log('   ✓ people.csv cached')
  } else if (debug) {
    console.log('   Using cached people.csv')
  }

  // Download IPL match zip
  if (forceRefresh || isCacheStale(ZIP_PATH)) {
    console.log('⬇  Downloading IPL match data from Cricsheet (~4MB)...')
    const res = await fetchWithRetry(CRICSHEET_IPL_ZIP)
    const buf = await res.arrayBuffer()
    fs.writeFileSync(ZIP_PATH, Buffer.from(buf))
    console.log(`   ✓ ipl_json.zip cached (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)`)

    // Extract zip
    console.log('   Extracting matches...')
    fs.mkdirSync(EXTRACT_DIR, { recursive: true })
    const { execSync } = await import('child_process')
    execSync(`unzip -q -o "${ZIP_PATH}" -d "${EXTRACT_DIR}"`)

    // Build index
    buildMatchIndex(debug)
  } else if (debug) {
    console.log('   Using cached match zip')
  }

  // Build index if missing
  if (!fs.existsSync(INDEX_PATH)) {
    if (!fs.existsSync(EXTRACT_DIR)) {
      console.log('   Extracting matches...')
      fs.mkdirSync(EXTRACT_DIR, { recursive: true })
      const { execSync } = await import('child_process')
      execSync(`unzip -q -o "${ZIP_PATH}" -d "${EXTRACT_DIR}"`)
    }
    buildMatchIndex(debug)
  }
}

function buildMatchIndex(debug: boolean) {
  const files = fs.readdirSync(EXTRACT_DIR).filter(f => f.endsWith('.json'))
  const index: MatchIndex[] = []

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(EXTRACT_DIR, file), 'utf8')
      const match: CricsheetMatch = JSON.parse(raw)
      const info = match.info
      const teamAbbrevs = info.teams.map(t => TEAM_ABBREV[t] ?? t)
      index.push({
        id: file.replace('.json', ''),
        season: String(info.season),
        date: info.dates[0],
        teams: info.teams,
        teamAbbrevs,
        matchNumber: info.event?.match_number ?? null,
      })
    } catch {
      // skip malformed files
    }
  }

  index.sort((a, b) => a.date.localeCompare(b.date))
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2))
  if (debug) console.log(`   ✓ Built index of ${index.length} matches`)
}

// ── People Registry ─────────────────────────────────────────────────────────

function buildCricinfoMap(): Map<string, string> {
  // Returns: cricsheet_id → cricinfo_id
  const csv = fs.readFileSync(PEOPLE_PATH, 'utf8')
  const lines = csv.split('\n')
  const headers = lines[0].split(',')
  const idxId        = headers.indexOf('identifier')
  const idxCricinfo  = headers.indexOf('key_cricinfo')

  const map = new Map<string, string>()
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const id        = cols[idxId]?.trim()
    const cricinfo  = cols[idxCricinfo]?.trim()
    if (id && cricinfo) map.set(id, cricinfo)
  }
  return map
}

// ── Match Parsing ────────────────────────────────────────────────────────────

function parseMatch(
  match: CricsheetMatch,
  cricinfoMap: Map<string, string>,
): {
  playerStats: Map<string, PlayerPerf>
  playerNameToCricinfoId: Map<string, string>
  unmatched: string[]
} {
  const { registry } = match.info

  // Map player name → cricinfo_id via: name → registry_id → cricinfoMap
  const playerNameToCricinfoId = new Map<string, string>()
  const unmatched: string[] = []

  for (const [playerName, registryId] of Object.entries(registry.people)) {
    const cricinfoId = cricinfoMap.get(registryId)
    if (cricinfoId) {
      playerNameToCricinfoId.set(playerName, cricinfoId)
    } else {
      unmatched.push(playerName)
    }
  }

  // Initialize per-player stats
  const playerStats = new Map<string, PlayerPerf>()
  const allPlayers = Object.values(match.info.players).flat()

  for (const name of allPlayers) {
    playerStats.set(name, {
      runs: 0, ballsFaced: 0, fours: 0, sixes: 0, isDuck: false,
      legalDeliveries: 0, runsConceded: 0, wickets: 0, maidenOvers: 0,
      catches: 0, stumpings: 0, runOutsDirect: 0, runOutsAssist: 0,
      didBat: false, didBowl: false,
    })
  }

  function getOrCreate(name: string): PlayerPerf {
    if (!playerStats.has(name)) {
      playerStats.set(name, {
        runs: 0, ballsFaced: 0, fours: 0, sixes: 0, isDuck: false,
        legalDeliveries: 0, runsConceded: 0, wickets: 0, maidenOvers: 0,
        catches: 0, stumpings: 0, runOutsDirect: 0, runOutsAssist: 0,
        didBat: false, didBowl: false,
      })
    }
    return playerStats.get(name)!
  }

  const battersFaced = new Set<string>() // track who faced at least 1 ball

  for (const inning of match.innings) {
    // Track overs bowled per bowler to detect maidens
    const overRunsByBowler = new Map<string, number[]>() // bowler → [runs per over]
    let currentBowler = ''
    let currentBowlerOver = -1
    let currentOverRuns = 0

    for (const { over, deliveries } of inning.overs) {
      for (const delivery of deliveries) {
        const { batter, bowler, runs, extras, wickets: wicketList } = delivery

        const isWide   = (extras?.wides ?? 0) > 0
        const isNoBall = (extras?.noballs ?? 0) > 0
        const isLegal  = !isWide  // wides don't count; no-balls do count as a delivery

        // ── BATTING ──
        if (!isWide) {  // wides don't count as a ball faced
          const b = getOrCreate(batter)
          b.ballsFaced++
          b.runs += runs.batter
          b.didBat = true
          battersFaced.add(batter)
          if (runs.batter === 4) b.fours++
          if (runs.batter === 6) b.sixes++
        }

        // ── BOWLING ──
        const bowlerPerf = getOrCreate(bowler)
        bowlerPerf.didBowl = true

        // Runs conceded = batter runs + extras caused by bowler (wides + no-balls), not byes/legbyes
        const bowlerExtras = (extras?.wides ?? 0) + (extras?.noballs ?? 0)
        bowlerPerf.runsConceded += runs.batter + bowlerExtras

        if (isLegal) {
          bowlerPerf.legalDeliveries++
        }

        // Track maiden overs
        if (bowler !== currentBowler || over !== currentBowlerOver) {
          // Save previous over's run tally
          if (currentBowler) {
            const existing = overRunsByBowler.get(currentBowler) ?? []
            existing.push(currentOverRuns)
            overRunsByBowler.set(currentBowler, existing)
          }
          currentBowler = bowler
          currentBowlerOver = over
          currentOverRuns = 0
        }
        currentOverRuns += runs.batter + bowlerExtras

        // ── WICKETS ──
        for (const wicket of (wicketList ?? [])) {
          const { kind, fielders } = wicket
          const nonFieldingKinds = ['bowled', 'lbw', 'hit wicket', 'handled the ball', 'obstructing the field', 'hit the ball twice', 'timed out']

          if (kind === 'caught') {
            bowlerPerf.wickets++
            // Fielder gets a catch (includes caught-behind by WK)
            const catcher = fielders?.[0]
            if (catcher && !catcher.substitute) {
              getOrCreate(catcher.name).catches++
            }
          } else if (kind === 'stumped') {
            bowlerPerf.wickets++
            const stumper = fielders?.[0]
            if (stumper && !stumper.substitute) {
              getOrCreate(stumper.name).stumpings++
            }
          } else if (nonFieldingKinds.includes(kind)) {
            bowlerPerf.wickets++
          } else if (kind === 'run out') {
            // Run out: 1 fielder = direct, 2 fielders = direct + assist
            const nonSubs = (fielders ?? []).filter(f => !f.substitute)
            if (nonSubs.length === 1) {
              getOrCreate(nonSubs[0].name).runOutsDirect++
            } else if (nonSubs.length >= 2) {
              getOrCreate(nonSubs[0].name).runOutsDirect++
              getOrCreate(nonSubs[1].name).runOutsAssist++
            }
            // Run outs don't count as bowler wickets
          }
          // 'retired hurt', 'retired out' → no bowler wicket, no fielder credit
        }
      }
    }

    // Save last bowler's over
    if (currentBowler) {
      const existing = overRunsByBowler.get(currentBowler) ?? []
      existing.push(currentOverRuns)
      overRunsByBowler.set(currentBowler, existing)
    }

    // Count maiden overs
    for (const [bowlerName, overs] of overRunsByBowler) {
      const maidens = overs.filter(r => r === 0).length
      getOrCreate(bowlerName).maidenOvers += maidens
    }
  }

  // Detect ducks: faced at least 1 ball, scored 0, was dismissed
  // We need to check if batter was dismissed — look through all wickets
  const dismissedBatters = new Set<string>()
  for (const inning of match.innings) {
    for (const { deliveries } of inning.overs) {
      for (const delivery of deliveries) {
        for (const w of delivery.wickets ?? []) {
          if (w.kind !== 'run out' && w.kind !== 'retired hurt' && w.kind !== 'retired out') {
            dismissedBatters.add(w.player_out)
          }
          // Run outs still count as the batter being out
          if (w.kind === 'run out') {
            dismissedBatters.add(w.player_out)
          }
        }
      }
    }
  }

  for (const [name, perf] of playerStats) {
    if (perf.runs === 0 && battersFaced.has(name) && dismissedBatters.has(name)) {
      perf.isDuck = true
    }
  }

  return { playerStats, playerNameToCricinfoId, unmatched }
}

// ── Formatting ───────────────────────────────────────────────────────────────

function formatOvers(legalDeliveries: number): number {
  const full = Math.floor(legalDeliveries / 6)
  const rem  = legalDeliveries % 6
  return parseFloat(`${full}.${rem}`)
}

function color(text: string, code: string) {
  return `\x1b[${code}m${text}\x1b[0m`
}
const bold   = (s: string) => color(s, '1')
const cyan   = (s: string) => color(s, '36')
const green  = (s: string) => color(s, '32')
const yellow = (s: string) => color(s, '33')
const red    = (s: string) => color(s, '31')
const dim    = (s: string) => color(s, '2')

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs()
  loadEnv()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error(red('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'))
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  // ── Ensure cache ──
  await ensureCache(args.refreshCache, args.debug)

  const index: MatchIndex[] = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'))

  // ── --list mode ──
  if (args.list) {
    if (args.fromDb) {
      // Show live schedule from Supabase DB
      const { data: dbMatches, error } = await supabase
        .from('ipl_matches')
        .select('id, match_number, team1, team2, scheduled_at, status, gameweek_id')
        .order('match_number')

      if (error || !dbMatches?.length) {
        console.log(yellow('\n  No matches in your DB yet.'))
        console.log(dim('  Run "Load Schedule" in the admin page, then try again.\n'))
        return
      }

      // Find which matches have performances saved
      const { data: perfCounts } = await supabase
        .from('player_performances')
        .select('match_id')

      const matchesWithPerfs = new Set((perfCounts ?? []).map((r: { match_id: string }) => r.match_id))

      const now = new Date()
      const STATUS_ICON: Record<string, string> = {
        live:      green('● LIVE'),
        completed: dim('✓ done'),
        upcoming:  dim('○ soon'),
      }

      console.log(bold('\n  Your DB Match Schedule\n'))
      console.log(dim('  M#   Teams            Scheduled (IST)       Status     Gameweek  Scores'))
      console.log(dim('  ' + '─'.repeat(75)))

      for (const m of dbMatches) {
        const mnum    = `#${String(m.match_number).padEnd(3)}`
        const teams   = `${m.team1} vs ${m.team2}`.padEnd(16)
        const hasPref = matchesWithPerfs.has(m.id)
        const scores  = hasPref ? green('✓ entered') : dim('─')
        const gw      = m.gameweek_id ? cyan('GW assigned') : dim('no GW')

        let scheduled = '─'
        if (m.scheduled_at) {
          const d = new Date(m.scheduled_at)
          const isLiveWindow = d <= now && now <= new Date(d.getTime() + 4 * 60 * 60 * 1000)
          if (isLiveWindow && m.status === 'live') {
            // already marked live in DB
          }
          scheduled = d.toLocaleString('en-IN', {
            day: '2-digit', month: 'short',
            hour: '2-digit', minute: '2-digit',
            timeZone: 'Asia/Kolkata',
          }) + ' IST'
        }

        const statusLabel = STATUS_ICON[m.status] ?? dim(m.status)
        console.log(`  ${dim(mnum)} ${teams} ${scheduled.padEnd(22)} ${statusLabel.padEnd(16)} ${gw.padEnd(14)} ${scores}`)
      }

      const live      = dbMatches.filter((m: { status: string }) => m.status === 'live').length
      const completed = dbMatches.filter((m: { status: string }) => m.status === 'completed').length
      const upcoming  = dbMatches.filter((m: { status: string }) => m.status === 'upcoming').length

      console.log(dim('\n  ' + '─'.repeat(75)))
      console.log(`  ${green(`${live} live`)}  ${dim(`${completed} completed`)}  ${dim(`${upcoming} upcoming`)}  ${dim(`${matchesWithPerfs.size} with scores entered`)}`)
      console.log()
      console.log(dim('  Tip: use --list (without --from-db) to see completed historical matches'))
      console.log(dim('       you can fetch and score with --match-id <cricsheet_id>\n'))
    } else {
      // Show completed matches from Cricsheet dataset
      const season = args.season
      const seasonMatches = index.filter(m => m.season === season)
      console.log(bold(`\n  IPL ${season} — ${seasonMatches.length} completed matches in Cricsheet\n`))
      console.log(dim('  Cricsheet ID  Date        Teams            Match#'))
      console.log(dim('  ' + '─'.repeat(55)))
      for (const m of seasonMatches) {
        const teams = m.teamAbbrevs.join(' vs ').padEnd(16)
        const mnum  = m.matchNumber ? `#${m.matchNumber}` : '─'
        console.log(`  ${cyan(m.id.padEnd(13))} ${m.date}  ${teams}  ${mnum}`)
      }
      console.log()
      console.log(dim('  Use --list --from-db to see your live IPL 2026 schedule from the DB\n'))
    }
    return
  }

  // ── Resolve which match to process ──
  let targetMatch: MatchIndex | undefined

  if (args.matchId) {
    targetMatch = index.find(m => m.id === args.matchId)
    if (!targetMatch) {
      console.error(red(`❌  Match ID ${args.matchId} not found in index. Try --list to see available IDs.`))
      process.exit(1)
    }
  } else if (args.latest) {
    const seasonMatches = index.filter(m => m.season === args.season)
    targetMatch = seasonMatches[seasonMatches.length - 1]
    if (!targetMatch) {
      console.error(red(`❌  No matches found for season ${args.season}. Try --refresh-cache.`))
      process.exit(1)
    }
    console.log(dim(`  Using latest match in dataset: ${targetMatch.id}`))
  } else {
    console.log(`\n${bold('Usage:')}`)
    console.log('  npx tsx agents/fetch-match-scores.ts --list')
    console.log('  npx tsx agents/fetch-match-scores.ts --list --season 2025')
    console.log('  npx tsx agents/fetch-match-scores.ts --match-id <id> --dry-run')
    console.log('  npx tsx agents/fetch-match-scores.ts --match-id <id> --league-id <uuid>')
    console.log('  npx tsx agents/fetch-match-scores.ts --latest\n')
    process.exit(0)
  }

  // ── Load match data ──
  const matchFile = path.join(EXTRACT_DIR, `${targetMatch.id}.json`)
  const matchData: CricsheetMatch = JSON.parse(fs.readFileSync(matchFile, 'utf8'))

  // ── Header ──
  const matchTitle = `${targetMatch.teamAbbrevs[0]} vs ${targetMatch.teamAbbrevs[1]}`
  const matchNum   = targetMatch.matchNumber ? ` · Match #${targetMatch.matchNumber}` : ''
  const winner     = matchData.info.outcome?.winner
    ? `Winner: ${TEAM_ABBREV[matchData.info.outcome.winner] ?? matchData.info.outcome.winner}`
    : matchData.info.outcome?.result ?? ''

  console.log()
  console.log(bold(cyan(`  ◈ ${matchTitle}${matchNum}  ·  ${targetMatch.date}  ·  IPL ${targetMatch.season}`)))
  if (winner) console.log(dim(`  ${winner}`))
  console.log()

  // ── Build player ID map ──
  const cricinfoMap = buildCricinfoMap()
  const { playerStats, playerNameToCricinfoId, unmatched } = parseMatch(matchData, cricinfoMap)

  if (args.debug && unmatched.length > 0) {
    console.log(dim(`  [debug] ${unmatched.length} players without cricinfo mapping:`))
    unmatched.forEach(n => console.log(dim(`           · ${n}`)))
  }

  // ── Fetch DB players (cricinfo_id → uuid) ──
  const { data: dbPlayers, error: dbErr } = await supabase
    .from('ipl_players')
    .select('id, name, cricinfo_id, role')

  if (dbErr || !dbPlayers) {
    console.error(red(`❌  Failed to fetch players from DB: ${dbErr?.message}`))
    process.exit(1)
  }

  const dbByCricinfoId = new Map(
    dbPlayers.filter(p => p.cricinfo_id).map(p => [String(p.cricinfo_id), p])
  )

  if (args.debug) {
    console.log(dim(`  [debug] ${dbByCricinfoId.size} DB players with cricinfo_id`))
    console.log(dim(`  [debug] ${playerNameToCricinfoId.size} match players mapped to cricinfo_id`))
  }

  // ── Find corresponding DB match ──
  const { data: dbMatches } = await supabase
    .from('ipl_matches')
    .select('id, match_number, team1, team2, gameweek_id')

  const dbMatch = (dbMatches ?? []).find((m: { team1: string; team2: string }) => {
    const t1 = targetMatch!.teamAbbrevs[0]
    const t2 = targetMatch!.teamAbbrevs[1]
    return (m.team1 === t1 && m.team2 === t2) || (m.team1 === t2 && m.team2 === t1)
  })

  if (args.debug) {
    if (dbMatch) console.log(dim(`  [debug] Matched to DB match #${dbMatch.match_number} (${dbMatch.id})`))
    else console.log(yellow('  [debug] No matching DB match found (stats can still be previewed)'))
  }

  // ── Build performance rows ──
  const perfRows: Array<{
    name: string
    cricinfoId: string
    dbPlayerId: string | null
    dbPlayerName: string | null
    perf: PlayerPerf
    fantasyPts: number
  }> = []

  // All players who participated (batted, bowled, or fielded)
  for (const [playerName, perf] of playerStats) {
    const hasActivity = perf.didBat || perf.didBowl ||
      perf.catches > 0 || perf.stumpings > 0 ||
      perf.runOutsDirect > 0 || perf.runOutsAssist > 0

    if (!hasActivity) continue

    const cricinfoId = playerNameToCricinfoId.get(playerName)
    const dbPlayer = cricinfoId ? dbByCricinfoId.get(cricinfoId) : undefined

    const fantasyInput = {
      player_id: dbPlayer?.id ?? '',
      match_id: dbMatch?.id ?? '',
      runs: perf.runs,
      balls_faced: perf.ballsFaced,
      fours: perf.fours,
      sixes: perf.sixes,
      is_duck: perf.isDuck,
      wickets: perf.wickets,
      overs_bowled: formatOvers(perf.legalDeliveries),
      runs_conceded: perf.runsConceded,
      maidens: perf.maidenOvers,
      catches: perf.catches,
      stumpings: perf.stumpings,
      run_outs_direct: perf.runOutsDirect,
      run_outs_assist: perf.runOutsAssist,
      is_playing_xi: true,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fantasyPts = calculatePoints(fantasyInput as any)

    perfRows.push({
      name: playerName,
      cricinfoId: cricinfoId ?? '—',
      dbPlayerId: dbPlayer?.id ?? null,
      dbPlayerName: dbPlayer?.name ?? null,
      perf,
      fantasyPts,
    })
  }

  // Sort by fantasy points desc
  perfRows.sort((a, b) => b.fantasyPts - a.fantasyPts)

  // ── Print performance table ──
  const matched   = perfRows.filter(r => r.dbPlayerId)
  const unmatched2 = perfRows.filter(r => !r.dbPlayerId)

  console.log(bold(`  Player Performances (${perfRows.length} players, ${matched.length} in your league)\n`))
  console.log(
    dim('  Player              Cricinfo   R   B  4s  6s  Dk  W   Ov   RC  Md  Ct  St  RO   ') +
    bold('Pts')
  )
  console.log(dim('  ' + '─'.repeat(100)))

  for (const row of perfRows) {
    const { perf } = row
    const name  = (row.dbPlayerName ?? row.name).slice(0, 18).padEnd(19)
    const cid   = row.cricinfoId.padEnd(10)
    const ov    = formatOvers(perf.legalDeliveries).toFixed(1).padStart(4)
    const mark  = row.dbPlayerId ? '' : dim(' ⚠ not in your league')
    const pts   = row.fantasyPts.toString().padStart(4)

    const ptsColor = row.fantasyPts >= 50 ? green : row.fantasyPts >= 25 ? cyan : row.fantasyPts < 0 ? red : (s: string) => s
    const nameColor = row.dbPlayerId ? (s: string) => s : dim

    console.log(
      `  ${nameColor(name)} ${dim(cid)} ` +
      `${String(perf.runs).padStart(3)} ` +
      `${String(perf.ballsFaced).padStart(3)} ` +
      `${String(perf.fours).padStart(3)} ` +
      `${String(perf.sixes).padStart(3)} ` +
      `${perf.isDuck ? red(' Y') : dim(' N')}  ` +
      `${String(perf.wickets).padStart(2)} ` +
      `${ov} ` +
      `${String(perf.runsConceded).padStart(4)} ` +
      `${String(perf.maidenOvers).padStart(3)} ` +
      `${String(perf.catches).padStart(3)} ` +
      `${String(perf.stumpings).padStart(3)} ` +
      `${String(perf.runOutsDirect + perf.runOutsAssist).padStart(3)}  ` +
      `${ptsColor(pts)}${mark}`
    )
  }

  console.log()

  if (unmatched2.length > 0) {
    console.log(dim(`  ⚠  ${unmatched2.length} players not in your league (shown above with ⚠)`))
    console.log(dim(`     Run the admin "Load Schedule" + add players to DB to match them.\n`))
  }

  // ── Summary stats ──
  const totalPtsInLeague = matched.reduce((s, r) => s + r.fantasyPts, 0)
  console.log(dim('  ' + '─'.repeat(100)))
  console.log(`  ${bold('Matched to your league:')} ${green(String(matched.length))} players   ${bold('Fantasy pts in pool:')} ${cyan(totalPtsInLeague.toFixed(1))}`)
  console.log()

  // ── Dry run mode ──
  if (args.dryRun) {
    console.log(yellow('  --dry-run active. Stats NOT saved to DB.\n'))
    return
  }

  // ── Need DB match to save ──
  if (!dbMatch) {
    console.log(yellow('  No matching DB match found.'))
    console.log(dim('  To save: first run "Load Schedule" in the admin page so this match exists in your DB.'))
    console.log(dim('  Then re-run this agent.\n'))
    return
  }

  if (matched.length === 0) {
    console.log(yellow('  No players matched to your league. Nothing to save.\n'))
    return
  }

  // ── Save performances ──
  const rows = matched.map(r => ({
    match_id: dbMatch.id,
    player_id: r.dbPlayerId!,
    runs: r.perf.runs,
    balls_faced: r.perf.ballsFaced,
    fours: r.perf.fours,
    sixes: r.perf.sixes,
    is_duck: r.perf.isDuck,
    wickets: r.perf.wickets,
    overs_bowled: formatOvers(r.perf.legalDeliveries),
    runs_conceded: r.perf.runsConceded,
    maidens: r.perf.maidenOvers,
    catches: r.perf.catches,
    stumpings: r.perf.stumpings,
    run_outs_direct: r.perf.runOutsDirect,
    run_outs_assist: r.perf.runOutsAssist,
    is_playing_xi: true,
    fantasy_points: r.fantasyPts,
  }))

  console.log(`  Saving ${rows.length} performances to DB...`)
  const { error: upsertErr } = await supabase
    .from('player_performances')
    .upsert(rows, { onConflict: 'match_id,player_id' })

  if (upsertErr) {
    console.error(red(`❌  DB upsert failed: ${upsertErr.message}\n`))
    process.exit(1)
  }
  console.log(green(`  ✓ ${rows.length} player_performances saved\n`))

  // ── Recalculate league points if league-id provided ──
  if (args.leagueId) {
    if (!dbMatch.gameweek_id) {
      console.log(yellow('  ⚠  This match has no gameweek_id — cannot recalculate member points.'))
      console.log(dim('  Run "Generate Gameweeks" in the admin page first.\n'))
      return
    }

    console.log('  Recalculating member points...')

    // Get all members
    const { data: members } = await supabase
      .from('league_members')
      .select('id, team_name, total_points')
      .eq('league_id', args.leagueId)

    if (!members?.length) {
      console.log(yellow('  No members found for this league.\n'))
      return
    }

    // Build player points map
    const playerPtsMap = new Map(matched.map(r => [r.dbPlayerId!, r.fantasyPts]))

    let updated = 0
    for (const member of members) {
      const { data: selections } = await supabase
        .from('weekly_selections')
        .select('player_id, is_captain, is_vice_captain')
        .eq('league_id', args.leagueId)
        .eq('member_id', member.id)
        .eq('gameweek_id', dbMatch.gameweek_id)

      if (!selections?.length) continue

      let matchPts = 0
      for (const sel of selections) {
        const rawPts   = playerPtsMap.get(sel.player_id) ?? 0
        const mult     = sel.is_captain ? 2 : sel.is_vice_captain ? 1.5 : 1
        matchPts      += rawPts * mult
      }

      const newTotal = Number(member.total_points) + matchPts
      await supabase
        .from('league_members')
        .update({ total_points: newTotal })
        .eq('id', member.id)

      console.log(`    ${green('+')}  ${(member.team_name ?? 'Unnamed').padEnd(20)} +${matchPts.toFixed(1)} pts → ${newTotal.toFixed(1)} total`)
      updated++
    }

    console.log(green(`\n  ✓ Updated ${updated}/${members.length} member totals\n`))
  } else {
    console.log(dim('  Tip: add --league-id <uuid> to automatically update member points.\n'))
  }
}

main().catch(err => {
  console.error(red(`\n❌  Unexpected error: ${err.message}`))
  if (process.env.DEBUG) console.error(err)
  process.exit(1)
})
