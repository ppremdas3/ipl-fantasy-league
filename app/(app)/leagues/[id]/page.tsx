import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { Trophy, Users, Zap, Crown, BarChart2, Shield } from 'lucide-react'
import CopyInviteButton from './CopyInviteButton'
import { FadeUp, StaggerList, StaggerItem } from '@/components/ui/motion'

function initials(name: string | null) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: league } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!league) notFound()

  const { data: myMembership } = await supabase
    .from('league_members')
    .select('*')
    .eq('league_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!myMembership) redirect('/dashboard')

  const { data: members } = await supabase
    .from('league_members')
    .select('id, team_name, total_points, user_id, profiles(display_name)')
    .eq('league_id', id)
    .order('total_points', { ascending: false })

  const { data: gameweeks } = await supabase
    .from('gameweeks')
    .select('id, name, deadline, status')
    .in('status', ['upcoming', 'active'])
    .order('week_number')
    .limit(1)
  const currentGameweek = gameweeks?.[0] ?? null

  const l = league as { id: string; name: string; invite_code: string; commissioner_id: string; status: string; max_teams: number; budget_per_team: number }
  const isCommissioner = l.commissioner_id === user.id
  const isPastDeadline = currentGameweek ? new Date(currentGameweek.deadline) < new Date() : true
  const myRank = ((members as { user_id: string }[] | null)?.findIndex(m => m.user_id === user.id) ?? 0) + 1
  const isLive = l.status === 'live'

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ── Header ── */}
      <FadeUp>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-rajdhani font-700 tracking-[0.15em] uppercase',
                  isLive ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'bg-[#0e2040]/60 text-[#5a7a9a]'
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', isLive ? 'bg-[#22c55e] animate-pulse' : 'bg-[#5a7a9a]')} />
                {l.status}
              </span>
              {isCommissioner && (
                <span className="inline-flex items-center gap-1 text-[10px] font-rajdhani font-700 tracking-[0.12em] uppercase text-[#f59e0b]">
                  <Crown className="w-3 h-3" />
                  Commissioner
                </span>
              )}
            </div>
            <h1 className="font-orbitron text-2xl font-900 tracking-wide uppercase text-white">
              {l.name}
            </h1>
            {/* Invite code */}
            <div className="flex items-center gap-2 mt-2">
              <span className="font-rajdhani text-xs tracking-wider text-[#5a7a9a]">Invite:</span>
              <code
                className="font-mono text-xs px-2 py-0.5 rounded-md text-[#00d4ff] tracking-widest"
                style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}
              >
                {l.invite_code}
              </code>
              <CopyInviteButton code={l.invite_code} />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <Link
              href={`/leagues/${id}/team`}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'border-[#0e2040] hover:border-[#00d4ff]/40 text-[#5a7a9a] hover:text-white gap-1.5 font-rajdhani tracking-wider uppercase text-xs'
              )}
            >
              <Shield className="w-3.5 h-3.5" />
              My Team
            </Link>
            <Link
              href={`/leagues/${id}/leaderboard`}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'border-[#0e2040] hover:border-[#00d4ff]/40 text-[#5a7a9a] hover:text-white gap-1.5 font-rajdhani tracking-wider uppercase text-xs'
              )}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Leaderboard
            </Link>
            {currentGameweek && !isPastDeadline && (
              <Link
                href={`/leagues/${id}/select`}
                className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5 font-rajdhani tracking-wider uppercase text-xs text-white')}
                style={{ background: 'linear-gradient(135deg, #ff8800, #ff6b00)', boxShadow: '0 0 16px rgba(255,107,0,0.4)' }}
              >
                <Zap className="w-3.5 h-3.5" />
                Select — {currentGameweek.name}
              </Link>
            )}
            {isCommissioner && l.status === 'setup' && (
              <GoLiveButton leagueId={id} />
            )}
          </div>
        </div>
      </FadeUp>

      {/* ── Stats row ── */}
      <FadeUp delay={0.1}>
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              icon: <Users className="w-4 h-4 text-[#00d4ff]" />,
              iconBg: 'rgba(0,212,255,0.08)',
              value: <>{members?.length ?? 0}<span className="text-[#5a7a9a] font-normal text-sm">/{l.max_teams}</span></>,
              valueColor: '#00d4ff',
              label: 'Teams',
            },
            {
              icon: <Trophy className="w-4 h-4 text-[#22c55e]" />,
              iconBg: 'rgba(34,197,94,0.08)',
              value: Number(myMembership.total_points).toFixed(1),
              valueColor: '#22c55e',
              label: 'Your Points',
            },
            {
              icon: <Crown className="w-4 h-4 text-[#f59e0b]" />,
              iconBg: 'rgba(245,158,11,0.08)',
              value: `#${myRank}`,
              valueColor: '#f59e0b',
              label: 'Your Rank',
            },
          ].map(({ icon, iconBg, value, valueColor, label }) => (
            <div key={label} className="card-hud rounded-2xl p-4 text-center">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center mx-auto mb-2"
                style={{ background: iconBg }}
              >
                {icon}
              </div>
              <p className="stat-number text-2xl leading-none" style={{ color: valueColor }}>
                {value}
              </p>
              <p className="font-rajdhani text-[9px] tracking-[0.2em] uppercase text-[#5a7a9a] mt-1">
                {label}
              </p>
            </div>
          ))}
        </div>
      </FadeUp>

      {/* ── Gameweek deadline banner ── */}
      {currentGameweek && (
        <FadeUp delay={0.15}>
          <div
            className={cn(
              'rounded-xl border px-4 py-3 flex items-center justify-between text-sm',
              isPastDeadline
                ? 'border-[#0e2040] bg-[#080e1c]'
                : 'border-[rgba(255,107,0,0.3)] bg-[rgba(255,107,0,0.05)]'
            )}
            style={isPastDeadline ? {} : { boxShadow: '0 0 20px rgba(255,107,0,0.08)' }}
          >
            <div className="flex items-center gap-2">
              {!isPastDeadline && <Zap className="w-4 h-4 text-[#ff6b00]" />}
              <span className={cn('font-rajdhani tracking-wider', isPastDeadline ? 'text-[#5a7a9a]' : 'text-white font-600')}>
                {currentGameweek.name} — {isPastDeadline ? 'selection closed' : 'selection open'}
              </span>
            </div>
            <span className="font-rajdhani text-xs tracking-wider text-[#5a7a9a]">
              Deadline: {new Date(currentGameweek.deadline).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        </FadeUp>
      )}

      {/* ── Teams table ── */}
      <FadeUp delay={0.2}>
        <div className="section-label mb-4">Teams</div>
        <div className="card-hud rounded-2xl overflow-hidden">
          <StaggerList>
            {(members as { id: string; team_name: string | null; total_points: number; user_id: string; profiles: { display_name: string } | null }[] | null)?.map((m, i) => {
              const isMe = m.user_id === user.id
              const pts = Number(m.total_points)

              return (
                <StaggerItem key={m.id}>
                  <div
                    className={cn(
                      'flex items-center justify-between px-5 py-3.5 transition-colors',
                      isMe ? 'bg-[#ff6b00]/5' : 'hover:bg-white/[0.02]',
                      i > 0 && 'border-t border-[#0e2040]/60'
                    )}
                  >
                    {/* Rank */}
                    <div className="w-8 shrink-0 text-center">
                      <span className="font-orbitron text-xs font-800 text-[#5a7a9a]">
                        #{i + 1}
                      </span>
                    </div>

                    {/* Avatar + name */}
                    <div className="flex items-center gap-3 flex-1 min-w-0 ml-2">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black font-orbitron shrink-0"
                        style={{
                          background: isMe ? 'rgba(255,107,0,0.1)' : 'rgba(0,212,255,0.06)',
                          color: isMe ? '#ff6b00' : '#00d4ff',
                          border: `1px solid ${isMe ? 'rgba(255,107,0,0.25)' : 'rgba(0,212,255,0.12)'}`,
                        }}
                      >
                        {initials(m.team_name ?? m.profiles?.display_name ?? null)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-orbitron text-[11px] font-700 uppercase tracking-wide text-white truncate">
                          {m.team_name ?? 'Unnamed Team'}
                          {isMe && (
                            <span
                              className="ml-2 font-rajdhani text-[9px] tracking-[0.15em] uppercase px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(255,107,0,0.12)', color: '#ff6b00' }}
                            >
                              You
                            </span>
                          )}
                        </p>
                        <p className="font-rajdhani text-[10px] tracking-wider text-[#5a7a9a] truncate">
                          {m.profiles?.display_name ?? ''}
                        </p>
                      </div>
                    </div>

                    {/* Points */}
                    <div className="text-right shrink-0">
                      <p className="stat-number text-lg leading-none" style={{ color: '#ff6b00' }}>
                        {pts.toFixed(1)}
                      </p>
                      <p className="font-rajdhani text-[9px] tracking-[0.15em] uppercase text-[#5a7a9a] mt-0.5">pts</p>
                    </div>
                  </div>
                </StaggerItem>
              )
            })}
          </StaggerList>
        </div>
      </FadeUp>
    </div>
  )
}

function GoLiveButton({ leagueId }: { leagueId: string }) {
  return (
    <form action={async () => {
      'use server'
      const { createAdminClient } = await import('@/lib/supabase/server')
      const admin = await createAdminClient()
      await admin.from('leagues').update({ status: 'live' }).eq('id', leagueId)
      const { redirect } = await import('next/navigation')
      redirect(`/leagues/${leagueId}`)
    }}>
      <button
        type="submit"
        className={cn(buttonVariants({ size: 'sm' }), 'bg-[#22c55e] hover:bg-[#16a34a] text-white gap-1.5 font-rajdhani tracking-wider uppercase text-xs')}
        style={{ boxShadow: '0 0 14px rgba(34,197,94,0.3)' }}
      >
        <Zap className="w-3.5 h-3.5" />
        Go Live
      </button>
    </form>
  )
}
