/**
 * Shared scorecard parsing utilities used by:
 *   - /api/points/sync-scorecard  (admin manual trigger)
 *   - /api/cron/sync-scores       (automatic nightly cron)
 */

import { calculatePoints } from '@/lib/scoring/fantasy-points'
import { SupabaseClient } from '@supabase/supabase-js'

// ── Cricbuzz response types ───────────────────────────────────────────────────

export interface CricbuzzBatsman {
  id: number; name: string; runs: number; balls: number
  fours: number; sixes: number; outdec: string
}

export interface CricbuzzBowler {
  id: number; name: string; balls: number
  maidens: number; wickets: number; runs: number
}

export interface CricbuzzInning {
  batsman: CricbuzzBatsman[]
  bowler: CricbuzzBowler[]
}

export interface CricbuzzScorecard {
  scorecard: CricbuzzInning[]
  ismatchcomplete: boolean
  status: string
}

// ── DB types ──────────────────────────────────────────────────────────────────

export interface DbPlayer {
  id: string; name: string; cricbuzz_id: string | null
  ipl_team: string; role: string
}

export interface PlayerStats {
  runs: number; ballsFaced: number; fours: number; sixes: number; isDuck: boolean
  oversBowled: number; runsConceded: number; wickets: number; maidens: number
  catches: number; stumpings: number; runOutsDirect: number; runOutsAssist: number
  didBat: boolean; didBowl: boolean
}

export interface MatchedPlayer {
  dbPlayer: DbPlayer
  stats: PlayerStats
  fantasyPts: number
}

export interface SyncScorecardResult {
  matchNumber: number
  team1: string
  team2: string
  result: string
  playersMatched: number
  playersUnmatched: number
  unmatchedNames: string[]
  memberResults: { league_id: string; team_name: string; match_pts: number; new_total: number }[]
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

function ballsToOvers(balls: number): number {
  return parseFloat(`${Math.floor(balls / 6)}.${balls % 6}`)
}

function parseDismissal(outdec: string): { kind: string; fielder1: string | null; fielder2: string | null } {
  if (!outdec || outdec.trim() === '') return { kind: 'dnb', fielder1: null, fielder2: null }
  const s = outdec.trim()
  const lower = s.toLowerCase()

  if (lower === 'not out') return { kind: 'notout', fielder1: null, fielder2: null }

  if (/^c\s*&\s*b\s+/i.test(s)) {
    return { kind: 'caught&bowled', fielder1: s.replace(/^c\s*&\s*b\s+/i, '').trim(), fielder2: null }
  }

  const caughtMatch = s.match(/^c\s+(.*?)\s+b\s+\S/i)
  if (caughtMatch) {
    let f = caughtMatch[1].trim().replace(/^†/, '').trim()
    f = f.replace(/^sub\s*\([^)]+\)/i, '').trim()
    return { kind: 'caught', fielder1: f || null, fielder2: null }
  }

  const stMatch = s.match(/^st\s+(.*?)\s+b\s+/i)
  if (stMatch) return { kind: 'stumped', fielder1: stMatch[1].trim().replace(/^†/, '').trim() || null, fielder2: null }

  const roMatch = s.match(/^run\s+out\s*\((.+?)\)/i)
  if (roMatch) {
    const parts = roMatch[1].split('/').map((p: string) => p.trim()).filter((p: string) => p && p.toLowerCase() !== 'absent')
    return { kind: 'runout', fielder1: parts[0] ?? null, fielder2: parts[1] ?? null }
  }
  if (lower.startsWith('run out')) return { kind: 'runout', fielder1: null, fielder2: null }
  if (lower.startsWith('hit wicket')) return { kind: 'hitwicket', fielder1: null, fielder2: null }
  if (/^b\s+/i.test(s)) return { kind: 'bowled', fielder1: null, fielder2: null }
  if (lower.startsWith('lbw')) return { kind: 'lbw', fielder1: null, fielder2: null }

  return { kind: 'caught', fielder1: null, fielder2: null }
}

function normName(s: string) {
  return s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}

export function matchPlayerByName(name: string, pool: DbPlayer[]): DbPlayer | null {
  if (!name) return null
  const n = normName(name)
  let hit = pool.find(p => normName(p.name) === n)
  if (hit) return hit
  const ew = pool.filter(p => normName(p.name).endsWith(n))
  if (ew.length === 1) return ew[0]
  const last = n.split(' ').at(-1)!
  const lh = pool.filter(p => normName(p.name).split(' ').at(-1) === last)
  if (lh.length === 1) return lh[0]
  const toks = n.split(' ')
  const th = pool.filter(p => toks.every(t => normName(p.name).includes(t)))
  if (th.length === 1) return th[0]
  return null
}

// ── Core: parse scorecard into per-player stats ───────────────────────────────

export function parseScorecardStats(scorecard: CricbuzzInning[]): {
  statsMap: Map<string, PlayerStats>
  cricbuzzIdByName: Map<string, string>
} {
  const statsMap = new Map<string, PlayerStats>()
  const cricbuzzIdByName = new Map<string, string>()

  function getStats(name: string): PlayerStats {
    if (!statsMap.has(name)) {
      statsMap.set(name, {
        runs: 0, ballsFaced: 0, fours: 0, sixes: 0, isDuck: false,
        oversBowled: 0, runsConceded: 0, wickets: 0, maidens: 0,
        catches: 0, stumpings: 0, runOutsDirect: 0, runOutsAssist: 0,
        didBat: false, didBowl: false,
      })
    }
    return statsMap.get(name)!
  }

  for (const inning of scorecard) {
    for (const b of inning.batsman ?? []) {
      if (!b.name) continue
      if (b.id) cricbuzzIdByName.set(b.name, String(b.id))
      const s = getStats(b.name)
      if (b.balls === 0 && b.outdec === '') continue
      s.didBat = true
      s.runs       += b.runs
      s.ballsFaced += b.balls
      s.fours      += b.fours
      s.sixes      += b.sixes
      const dis = parseDismissal(b.outdec)
      if (b.runs === 0 && b.balls > 0 && dis.kind !== 'notout' && dis.kind !== 'dnb') s.isDuck = true
      if (dis.kind === 'caught' && dis.fielder1)        getStats(dis.fielder1).catches++
      if (dis.kind === 'caught&bowled' && dis.fielder1) getStats(dis.fielder1).catches++
      if (dis.kind === 'stumped' && dis.fielder1)       getStats(dis.fielder1).stumpings++
      if (dis.kind === 'runout') {
        if (dis.fielder1) getStats(dis.fielder1).runOutsDirect++
        if (dis.fielder2) getStats(dis.fielder2).runOutsAssist++
      }
    }
    for (const bwl of inning.bowler ?? []) {
      if (!bwl.name) continue
      if (bwl.id) cricbuzzIdByName.set(bwl.name, String(bwl.id))
      const s = getStats(bwl.name)
      s.didBowl      = true
      s.oversBowled  += ballsToOvers(bwl.balls)
      s.runsConceded += bwl.runs
      s.wickets      += bwl.wickets
      s.maidens      += bwl.maidens
    }
  }

  return { statsMap, cricbuzzIdByName }
}

// ── Core: match players + calculate fantasy points ────────────────────────────

export function resolveMatchedPlayers(
  statsMap: Map<string, PlayerStats>,
  cricbuzzIdByName: Map<string, string>,
  pool: DbPlayer[],
  dbMatchId: string,
): { matched: MatchedPlayer[]; unmatchedNames: string[] } {
  const dbCricbuzzIdMap = new Map<string, DbPlayer>()
  for (const p of pool) {
    if (p.cricbuzz_id) dbCricbuzzIdMap.set(p.cricbuzz_id, p)
  }

  const matched: MatchedPlayer[] = []
  const unmatchedNames: string[] = []

  for (const [name, stats] of statsMap.entries()) {
    const hasActivity = stats.didBat || stats.didBowl ||
      stats.catches > 0 || stats.stumpings > 0 || stats.runOutsDirect > 0 || stats.runOutsAssist > 0
    if (!hasActivity) continue

    const cid = cricbuzzIdByName.get(name)
    const dbPlayer = (cid ? dbCricbuzzIdMap.get(cid) : null) ?? matchPlayerByName(name, pool)

    if (!dbPlayer) { unmatchedNames.push(name); continue }

    const fantasyPts = calculatePoints({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      player_id: dbPlayer.id, match_id: dbMatchId, role: dbPlayer.role as any,
      runs: stats.runs, balls_faced: stats.ballsFaced,
      fours: stats.fours, sixes: stats.sixes, is_duck: stats.isDuck,
      wickets: stats.wickets, overs_bowled: stats.oversBowled,
      runs_conceded: stats.runsConceded, maidens: stats.maidens,
      catches: stats.catches, stumpings: stats.stumpings,
      run_outs_direct: stats.runOutsDirect, run_outs_assist: stats.runOutsAssist,
      is_playing_xi: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    matched.push({ dbPlayer, stats, fantasyPts })
  }

  return { matched, unmatchedNames }
}

// ── Core: save performances + update all leagues ──────────────────────────────

export async function saveScorecardToDb(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matchId: string,
  gameweekId: string,
  matched: MatchedPlayer[],
  scorecardStatus: string,
  leagueIds?: string[],  // undefined = all leagues
): Promise<{ memberResults: SyncScorecardResult['memberResults']; error?: string }> {

  // Upsert player_performances
  const perfRows = matched.map(r => ({
    match_id:        matchId,
    player_id:       r.dbPlayer.id,
    runs:            r.stats.runs,
    balls_faced:     r.stats.ballsFaced,
    fours:           r.stats.fours,
    sixes:           r.stats.sixes,
    is_duck:         r.stats.isDuck,
    wickets:         r.stats.wickets,
    overs_bowled:    r.stats.oversBowled,
    runs_conceded:   r.stats.runsConceded,
    maidens:         r.stats.maidens,
    catches:         r.stats.catches,
    stumpings:       r.stats.stumpings,
    run_outs_direct: r.stats.runOutsDirect,
    run_outs_assist: r.stats.runOutsAssist,
    is_playing_xi:   true,
    fantasy_points:  r.fantasyPts,
  }))

  const { error: perfErr } = await supabase
    .from('player_performances')
    .upsert(perfRows, { onConflict: 'match_id,player_id' })

  if (perfErr) return { memberResults: [], error: `Failed to save performances: ${perfErr.message}` }

  // Mark match completed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('ipl_matches')
    .update({ status: 'completed', result: scorecardStatus })
    .eq('id', matchId)

  // Resolve which leagues to update
  let targetLeagueIds = leagueIds
  if (!targetLeagueIds) {
    const { data: allLeagues } = await supabase.from('leagues').select('id')
    targetLeagueIds = (allLeagues ?? []).map((l: { id: string }) => l.id)
  }

  // Update member points for each league
  const playerPtsMap = new Map(matched.map(r => [r.dbPlayer.id, r.fantasyPts]))
  const memberResults: SyncScorecardResult['memberResults'] = []

  for (const lgId of targetLeagueIds) {
    const { data: members } = await supabase
      .from('league_members')
      .select('id, team_name, total_points')
      .eq('league_id', lgId)

    for (const member of members ?? []) {
      const { data: selections } = await supabase
        .from('weekly_selections')
        .select('player_id, is_captain, is_vice_captain')
        .eq('league_id', lgId)
        .eq('member_id', member.id)
        .eq('gameweek_id', gameweekId)

      if (!selections?.length) continue

      let matchPts = 0
      for (const sel of selections) {
        const rawPts = playerPtsMap.get(sel.player_id) ?? 0
        const mult   = sel.is_captain ? 2 : sel.is_vice_captain ? 1.5 : 1
        matchPts    += rawPts * mult
      }

      const newTotal = Number(member.total_points) + matchPts
      await supabase.from('league_members').update({ total_points: newTotal }).eq('id', member.id)

      memberResults.push({
        league_id:  lgId,
        team_name:  member.team_name ?? 'Unnamed',
        match_pts:  Math.round(matchPts * 10) / 10,
        new_total:  Math.round(newTotal * 10) / 10,
      })
    }
  }

  memberResults.sort((a, b) => b.match_pts - a.match_pts)
  return { memberResults }
}
