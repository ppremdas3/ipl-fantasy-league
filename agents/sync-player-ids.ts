/**
 * IPL Fantasy League — Player ID Sync Agent (Cricbuzz via RapidAPI)
 *
 * Fetches all 10 IPL team squads from Cricbuzz, matches each player to your
 * DB by name, and stores the cricbuzz_id mapping so future scorecard runs use
 * exact ID matching instead of fuzzy names.
 *
 * ⚠️  Uses 11 API requests (1 squads list + 10 team rosters). Run ONCE per season.
 *
 * Usage (from ipl-fantasy/ directory):
 *   npm run sync-players               # dry-run: preview matches, don't write DB
 *   npm run sync-players -- --save     # update ipl_players.cricbuzz_id in DB
 *
 * Prerequisites (if using --save):
 *   Run this SQL in Supabase first to add the cricbuzz_id column:
 *
 *   ALTER TABLE ipl_players ADD COLUMN IF NOT EXISTS cricbuzz_id TEXT;
 *   CREATE UNIQUE INDEX IF NOT EXISTS ipl_players_cricbuzz_id_idx ON ipl_players(cricbuzz_id);
 */

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import { createClient } from '@supabase/supabase-js'

// ── Config ────────────────────────────────────────────────────────────────────

const CACHE_DIR      = path.join(__dirname, '.cricket-cache')
const BUDGET_LOG     = path.join(CACHE_DIR, 'api_request_log.json')
const PLAYER_ID_MAP  = path.join(CACHE_DIR, 'player-id-map.json')
const MONTHLY_BUDGET = 200

const IPL_SERIES_ID = 9241

// Cricbuzz squad name → DB ipl_team abbreviation
const TEAM_ABBR: Record<string, string> = {
  'Chennai Super Kings':          'CSK',
  'Delhi Capitals':               'DC',
  'Gujarat Titans':               'GT',
  'Royal Challengers Bengaluru':  'RCB',
  'Punjab Kings':                 'PBKS',
  'Kolkata Knight Riders':        'KKR',
  'Sunrisers Hyderabad':          'SRH',
  'Rajasthan Royals':             'RR',
  'Lucknow Super Giants':         'LSG',
  'Mumbai Indians':               'MI',
}

// Cricbuzz role → DB role enum
function mapRole(role: string): string {
  const r = role.toLowerCase()
  if (r.includes('wk') || r.includes('keeper')) return 'wicket_keeper'
  if (r.includes('allrounder') || r.includes('all-rounder')) return 'all_rounder'
  if (r.includes('bowl')) return 'bowler'
  return 'batsman'
}

// Guess is_overseas from bowling/batting style country hints — best effort
// Cricbuzz doesn't return nationality directly; mark false and let user correct
function guessOverseas(_player: CricbuzzPlayer): boolean {
  return false   // conservative default; user corrects in Supabase if needed
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SquadEntry {
  squadId?: number
  squadType?: string   // team name
  teamId?: number
  isHeader?: boolean
}

interface CricbuzzPlayer {
  id?: string
  name: string
  role?: string
  captain?: boolean
  battingStyle?: string
  bowlingStyle?: string
  isHeader?: boolean
}

interface DbPlayer {
  id: string
  name: string
  ipl_team: string
  role: string
  cricbuzz_id: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function loadPlayerIdMap(): Record<string, string> {
  if (!fs.existsSync(PLAYER_ID_MAP)) return {}
  try { return JSON.parse(fs.readFileSync(PLAYER_ID_MAP, 'utf8')) }
  catch { return {} }
}

function savePlayerIdMap(map: Record<string, string>) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(PLAYER_ID_MAP, JSON.stringify(map, null, 2))
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

// ── Name matching (same logic as fetch-scorecard) ─────────────────────────────

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}

function matchByName(name: string, pool: DbPlayer[]): DbPlayer | null {
  if (!name) return null
  const n = normName(name)
  let hit = pool.find(p => normName(p.name) === n)
  if (hit) return hit
  const endsWith = pool.filter(p => normName(p.name).endsWith(n))
  if (endsWith.length === 1) return endsWith[0]
  const lastName = n.split(' ').at(-1)!
  const lastNameHits = pool.filter(p => normName(p.name).split(' ').at(-1) === lastName)
  if (lastNameHits.length === 1) return lastNameHits[0]
  const tokens = n.split(' ')
  const tokenHits = pool.filter(p => tokens.every(tok => normName(p.name).includes(tok)))
  if (tokenHits.length === 1) return tokenHits[0]
  return null
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv()

  const save = process.argv.includes('--save')

  const apiKey      = process.env.RAPIDAPI_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!apiKey)                     { console.error(red('❌  RAPIDAPI_KEY not in .env.local')); process.exit(1) }
  if (!supabaseUrl || !serviceKey) { console.error(red('❌  Supabase env vars missing'));       process.exit(1) }

  const budget    = loadBudgetLog()
  const remaining = MONTHLY_BUDGET - budget.requests
  const needed    = 11  // 1 squad list + 10 team rosters
  console.log()
  console.log(dim(`  Budget: ${budget.requests}/${MONTHLY_BUDGET} used (${remaining} remaining)`))
  if (remaining < needed) {
    console.error(red(`❌  Need ${needed} requests but only ${remaining} remaining this month.`))
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  // ── Load DB players ──
  const { data: dbPlayers, error: dbErr } = await supabase
    .from('ipl_players')
    .select('id, name, ipl_team, role, cricbuzz_id')
  if (dbErr) { console.error(red(`❌  DB read failed: ${dbErr.message}`)); process.exit(1) }
  const pool = (dbPlayers ?? []) as DbPlayer[]
  console.log(dim(`  ${pool.length} players in DB\n`))

  // ── Fetch squad list ──
  const squadListPath = `/series/v1/${IPL_SERIES_ID}/squads`
  process.stdout.write(`  Fetching squad list... `)
  const squadListRaw = await cricbuzzGet(squadListPath, apiKey) as { squads: SquadEntry[]; seriesId?: number; seriesName?: string }
  recordRequest(squadListPath)
  console.log(green('✓'))

  const teamSquads = (squadListRaw.squads ?? []).filter(
    (s): s is Required<Pick<SquadEntry, 'squadId' | 'squadType' | 'teamId'>> & SquadEntry =>
      !s.isHeader && !!s.squadId
  )

  console.log(dim(`  Found ${teamSquads.length} teams in series ${squadListRaw.seriesId ?? IPL_SERIES_ID}\n`))

  // ── Fetch each team roster ──
  const idMap = loadPlayerIdMap()
  let matched = 0, alreadyKnown = 0, unmatched = 0, alreadyInDb = 0

  interface Result {
    team: string              // full Cricbuzz team name
    teamAbbr: string          // DB abbreviation
    cricbuzzId: string
    cricbuzzName: string
    cricbuzzPlayer: CricbuzzPlayer
    dbPlayer: DbPlayer | null
    alreadyMapped: boolean
  }
  const allResults: Result[] = []

  for (const squad of teamSquads) {
    const squadPath = `/series/v1/${IPL_SERIES_ID}/squads/${squad.squadId}`
    process.stdout.write(`  ${squad.squadType.padEnd(28)} `)
    const squadRaw = await cricbuzzGet(squadPath, apiKey) as { player: CricbuzzPlayer[] }
    recordRequest(squadPath)

    const players = (squadRaw.player ?? []).filter(p => !p.isHeader && p.id)

    let teamMatched = 0, teamUnmatched = 0

    for (const p of players) {
      const cid = p.id!
      const alreadyMapped = !!idMap[cid]

      let dbPlayer: DbPlayer | null = null
      if (alreadyMapped) {
        dbPlayer = pool.find(db => db.id === idMap[cid]) ?? null
        alreadyKnown++
      } else {
        dbPlayer = matchByName(p.name, pool)
        if (dbPlayer) {
          idMap[cid] = dbPlayer.id
          matched++
          teamMatched++
        } else {
          unmatched++
          teamUnmatched++
        }
      }

      if (dbPlayer?.cricbuzz_id) alreadyInDb++

      allResults.push({
        team: squad.squadType,
        teamAbbr: TEAM_ABBR[squad.squadType] ?? squad.squadType,
        cricbuzzId: cid,
        cricbuzzName: p.name,
        cricbuzzPlayer: p,
        dbPlayer,
        alreadyMapped,
      })
    }

    const icon = teamUnmatched === 0 ? green('✓') : yellow(`⚠ ${teamUnmatched} unmatched`)
    console.log(`${icon}  (${players.length} players, ${teamMatched} newly mapped)`)
  }

  // Save updated map
  savePlayerIdMap(idMap)

  const totalMapped = Object.keys(idMap).length
  console.log(`\n  ${bold('Summary:')}`)
  console.log(`  ${green(`${matched} new mappings`)} added to player-id-map.json  (${totalMapped} total)`)
  if (alreadyKnown > 0) console.log(dim(`  ${alreadyKnown} already in local cache`))
  if (unmatched > 0)    console.log(yellow(`  ${unmatched} players could not be matched — add them to ipl_players first`))

  // ── Print unmatched list + ready-to-run SQL ──
  const unmatchedPlayers = allResults.filter(r => !r.dbPlayer && !r.alreadyMapped)
  if (unmatchedPlayers.length > 0) {
    console.log(yellow(`\n  ${unmatchedPlayers.length} players not in DB — copy this SQL into Supabase SQL editor:\n`))
    console.log(cyan('  ─── paste into Supabase → SQL editor ──────────────────────────────────────────'))
    console.log()
    console.log(`INSERT INTO public.ipl_players (name, ipl_team, role, nationality, base_price, is_overseas, cricbuzz_id) VALUES`)

    const sqlLines = unmatchedPlayers.map((r, i) => {
      const p    = r.cricbuzzPlayer
      const role = mapRole(p.role ?? '')
      const os   = guessOverseas(p)
      const name = r.cricbuzzName.replace(/'/g, "''")  // escape SQL single quotes
      const comma = i < unmatchedPlayers.length - 1 ? ',' : ';'
      return `  ('${name}', '${r.teamAbbr}', '${role}', 'India', 200, ${os}, '${r.cricbuzzId}')${comma}`
    })
    console.log(sqlLines.join('\n'))

    console.log()
    console.log(cyan('  ─────────────────────────────────────────────────────────────────────────────'))
    console.log()
    console.log(dim('  Notes:'))
    console.log(dim('  · nationality defaults to \'India\' — update overseas players manually'))
    console.log(dim('  · is_overseas defaults to false — set true for non-Indian players'))
    console.log(dim('  · base_price defaults to 200 (₹2Cr) — update if needed'))
    console.log(dim('  · After running the SQL, re-run: npm run sync-players -- --save'))
    console.log()
  }

  if (!save) {
    console.log(yellow('\n  --dry-run mode: local player-id-map.json written but DB not updated.'))
    console.log(dim('  Run with --save to update ipl_players.cricbuzz_id in DB.\n'))
    console.log(dim('  Tip: run this SQL in Supabase first if the column doesn\'t exist:'))
    console.log(cyan('  ALTER TABLE ipl_players ADD COLUMN IF NOT EXISTS cricbuzz_id TEXT;'))
    console.log(cyan('  CREATE UNIQUE INDEX IF NOT EXISTS ipl_players_cricbuzz_id_idx ON ipl_players(cricbuzz_id);'))
    console.log()
    return
  }

  // ── Update DB with cricbuzz_id ──
  console.log(`\n  Updating ipl_players.cricbuzz_id in DB...`)
  let dbUpdated = 0, dbSkipped = 0, dbFailed = 0

  for (const r of allResults) {
    if (!r.dbPlayer || !r.cricbuzzId) { dbSkipped++; continue }
    if (r.dbPlayer.cricbuzz_id === r.cricbuzzId) { dbSkipped++; continue }  // already set

    const { error } = await supabase
      .from('ipl_players')
      .update({ cricbuzz_id: r.cricbuzzId })
      .eq('id', r.dbPlayer.id)

    if (error) {
      console.log(red(`    ✗ ${r.dbPlayer.name}: ${error.message}`))
      dbFailed++
    } else {
      dbUpdated++
    }
  }

  if (dbFailed > 0) {
    console.log(yellow(`\n  ⚠  ${dbFailed} updates failed — cricbuzz_id column may not exist.`))
    console.log(dim('  Run this SQL in Supabase SQL editor:'))
    console.log(cyan('  ALTER TABLE ipl_players ADD COLUMN IF NOT EXISTS cricbuzz_id TEXT;'))
    console.log(cyan('  CREATE UNIQUE INDEX IF NOT EXISTS ipl_players_cricbuzz_id_idx ON ipl_players(cricbuzz_id);'))
    console.log(dim('  Then re-run with --save.\n'))
  } else {
    console.log(green(`  ✓ ${dbUpdated} players updated`))
    if (dbSkipped > 0) console.log(dim(`  ${dbSkipped} skipped (already set or no match)`))
    console.log()
  }
}

main().catch(err => {
  console.error(red(`\n❌  ${err.message}`))
  if (process.env.DEBUG) console.error(err.stack)
  process.exit(1)
})
