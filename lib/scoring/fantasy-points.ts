import type { PlayerPerformance } from '@/lib/supabase/types'

export function calculatePoints(perf: Omit<PlayerPerformance, 'id' | 'updated_at' | 'fantasy_points'>): number {
  let pts = 0

  // ── BATTING ──
  pts += perf.runs * 1
  pts += perf.fours * 1       // boundary bonus
  pts += perf.sixes * 2       // six bonus

  // Milestone bonuses
  if (perf.runs >= 100) pts += 16
  else if (perf.runs >= 50) pts += 8
  else if (perf.runs >= 25) pts += 4

  // Duck penalty (only if they faced at least 1 ball)
  if (perf.is_duck && perf.balls_faced > 0) pts -= 2

  // Strike rate bonus/penalty (min 10 balls faced)
  if (perf.balls_faced >= 10) {
    const sr = (perf.runs / perf.balls_faced) * 100
    if (sr >= 170) pts += 6
    else if (sr >= 150) pts += 4
    else if (sr >= 130) pts += 2
    else if (sr < 50) pts -= 6
    else if (sr < 60) pts -= 4
    else if (sr < 70) pts -= 2
  }

  // ── BOWLING ──
  pts += perf.wickets * 25

  // Wicket haul bonuses
  if (perf.wickets >= 5) pts += 16
  else if (perf.wickets >= 4) pts += 8
  else if (perf.wickets >= 3) pts += 4

  pts += perf.maidens * 4

  // Economy rate bonus/penalty (min 2 overs bowled)
  if (perf.overs_bowled >= 2) {
    const economy = perf.runs_conceded / perf.overs_bowled
    if (economy <= 5) pts += 6
    else if (economy <= 6) pts += 4
    else if (economy <= 7) pts += 2
    else if (economy >= 12) pts -= 6
    else if (economy >= 11) pts -= 4
    else if (economy >= 10) pts -= 2
  }

  // ── FIELDING ──
  pts += perf.catches * 8
  pts += perf.stumpings * 12
  pts += perf.run_outs_direct * 12
  pts += perf.run_outs_assist * 6

  return pts
}
