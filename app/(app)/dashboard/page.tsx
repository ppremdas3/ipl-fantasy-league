import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button-variants'
import { Plus, Users, Trophy, Zap, ChevronRight, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FadeUp, StaggerList, StaggerItem } from '@/components/ui/motion'
import { AnimatedName } from '@/components/ui/AnimatedName'

const STATUS_CONFIG: Record<string, { label: string; textColor: string; bgColor: string; dot: string; live: boolean }> = {
  setup:     { label: 'Setup',     textColor: 'text-[#5a7a9a]', bgColor: 'bg-[#0e2040]/60', dot: 'bg-[#5a7a9a]', live: false },
  live:      { label: 'Live',      textColor: 'text-[#22c55e]', bgColor: 'bg-[#22c55e]/10', dot: 'bg-[#22c55e]', live: true },
  completed: { label: 'Completed', textColor: 'text-[#5a7a9a]', bgColor: 'bg-[#0e2040]/60', dot: 'bg-[#5a7a9a]', live: false },
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('league_members')
    .select(`id, team_name, total_points, league:leagues(id, name, status, commissioner_id, budget_per_team)`)
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle()

  const displayName = (profile as { display_name: string } | null)?.display_name ?? 'Champion'
  const firstName = displayName.split(' ')[0].toUpperCase()

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <FadeUp>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-rajdhani text-xs tracking-[0.3em] uppercase text-[#5a7a9a] mb-1">
              Welcome back
            </p>
            <h1 className="font-orbitron text-3xl font-900 tracking-wide text-white">
              <AnimatedName name={firstName} />
            </h1>
            <div className="mt-2 h-px w-24 bg-gradient-to-r from-[#ff6b00]/60 to-transparent" />
          </div>
          <div className="flex gap-2 shrink-0 mt-1">
            <Link
              href="/leagues/join"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'border-[#0e2040] hover:border-[#00d4ff]/40 text-[#5a7a9a] hover:text-white gap-1.5 font-rajdhani tracking-wider uppercase text-xs'
              )}
            >
              <Users className="w-3.5 h-3.5" />
              Join
            </Link>
            <Link
              href="/leagues/new"
              className={cn(
                buttonVariants({ size: 'sm' }),
                'gap-1.5 font-rajdhani tracking-wider uppercase text-xs text-white'
              )}
              style={{ background: 'linear-gradient(135deg, #ff8800, #ff6b00)', boxShadow: '0 0 16px rgba(255,107,0,0.35)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              New League
            </Link>
          </div>
        </div>
      </FadeUp>

      {!memberships || memberships.length === 0 ? (
        /* ── Empty state ── */
        <FadeUp delay={0.15}>
          <div className="card-hud rounded-2xl py-20 text-center">
            {/* Corner brackets already from card-hud */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-5"
              style={{ background: 'rgba(255,107,0,0.08)', boxShadow: '0 0 24px rgba(255,107,0,0.15)' }}
            >
              🏟️
            </div>
            <h2 className="font-orbitron text-base font-800 tracking-wider uppercase text-white mb-2">
              No Leagues Yet
            </h2>
            <p className="font-rajdhani text-sm tracking-wider text-[#5a7a9a] mb-7">
              Create or join a league to start playing
            </p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/leagues/join"
                className={cn(buttonVariants({ variant: 'outline' }), 'border-[#0e2040] hover:border-[#00d4ff]/40 font-rajdhani tracking-wider uppercase text-xs')}
              >
                Join a league
              </Link>
              <Link
                href="/leagues/new"
                className={cn(buttonVariants(), 'font-rajdhani tracking-wider uppercase text-xs text-white')}
                style={{ background: 'linear-gradient(135deg, #ff8800, #ff6b00)', boxShadow: '0 0 16px rgba(255,107,0,0.35)' }}
              >
                Create one
              </Link>
            </div>
          </div>
        </FadeUp>
      ) : (
        /* ── League cards ── */
        <StaggerList className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {memberships.map((m) => {
            const league = m.league as unknown as { id: string; name: string; status: string; commissioner_id: string; budget_per_team: number } | null
            if (!league) return null
            const isCommissioner = league.commissioner_id === user.id
            const status = STATUS_CONFIG[league.status] ?? STATUS_CONFIG.setup
            const points = Number(m.total_points)

            return (
              <StaggerItem key={m.id}>
                <Link
                  href={`/leagues/${league.id}`}
                  className="group block card-hud rounded-2xl p-5 overflow-hidden"
                >
                  {/* Accent stripe — left edge */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl transition-all duration-300"
                    style={{
                      background: status.live
                        ? 'linear-gradient(180deg, #22c55e, #00d4ff)'
                        : 'linear-gradient(180deg, rgba(0,212,255,0.3), transparent)',
                    }}
                  />

                  {/* Live glow overlay (only when live) */}
                  {status.live && (
                    <div
                      className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{ background: 'radial-gradient(ellipse at 0% 50%, rgba(34,197,94,0.06) 0%, transparent 70%)' }}
                    />
                  )}

                  {/* Status badge */}
                  <div className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-rajdhani font-700 tracking-[0.15em] uppercase mb-3 ${status.textColor} ${status.bgColor}`}>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${status.dot} ${status.live ? 'animate-pulse' : ''}`}
                    />
                    {status.label}
                    {status.live && <span className="ml-0.5">·</span>}
                  </div>

                  {/* League name */}
                  <h3 className="font-orbitron text-sm font-800 tracking-wide text-white uppercase leading-tight line-clamp-1 mb-1">
                    {league.name}
                  </h3>
                  <p className="font-rajdhani text-xs tracking-wider text-[#5a7a9a] mb-4 flex items-center gap-1.5">
                    {m.team_name ?? 'No team name'}
                    {isCommissioner && (
                      <span className="inline-flex items-center gap-1 text-[#f59e0b] text-[9px] font-700 tracking-[0.15em] uppercase">
                        <Crown className="w-2.5 h-2.5" />
                        Commissioner
                      </span>
                    )}
                  </p>

                  {/* Points + arrow */}
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="font-rajdhani text-[9px] tracking-[0.25em] uppercase text-[#5a7a9a] mb-1">
                        Total Points
                      </p>
                      <p
                        className="stat-number text-3xl leading-none"
                        style={{ color: '#ff6b00' }}
                      >
                        {points.toFixed(1)}
                      </p>
                    </div>
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                      style={{
                        background: 'rgba(255,107,0,0.1)',
                        boxShadow: '0 0 0 1px rgba(255,107,0,0.2)',
                      }}
                    >
                      <ChevronRight className="w-5 h-5 text-[#ff6b00] transition-transform duration-300 group-hover:translate-x-0.5" />
                    </div>
                  </div>

                  {/* Bottom row */}
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[#0e2040]/80">
                    <div className="flex items-center gap-1.5 font-rajdhani text-[10px] tracking-[0.15em] uppercase text-[#5a7a9a]">
                      <Trophy className="w-3 h-3" />
                      League
                    </div>
                    {league.status === 'live' && (
                      <div className="flex items-center gap-1.5 font-rajdhani text-[10px] tracking-[0.15em] uppercase text-[#22c55e]">
                        <Zap className="w-3 h-3" />
                        Select Team
                      </div>
                    )}
                  </div>
                </Link>
              </StaggerItem>
            )
          })}
        </StaggerList>
      )}
    </div>
  )
}
