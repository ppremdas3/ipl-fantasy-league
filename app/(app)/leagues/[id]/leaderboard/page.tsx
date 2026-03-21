import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button-variants'
import { ArrowLeft, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FadeUp, StaggerList, StaggerItem } from '@/components/ui/motion'

type MemberRow = {
  id: string
  team_name: string | null
  total_points: number
  budget_remaining: number | null
  user_id: string
  profiles: { display_name: string } | null
}

const PODIUM_CONFIG = [
  { border: 'border-[rgba(245,158,11,0.5)]', glow: 'none', label: '#1', labelColor: '#F59E0B', height: 'h-28', order: 1 },
  { border: 'border-[rgba(148,163,184,0.4)]', glow: 'none', label: '#2', labelColor: '#94A3B8', height: 'h-20', order: 0 },
  { border: 'border-[rgba(205,127,50,0.4)]',  glow: 'none',  label: '#3', labelColor: '#CD7F32', height: 'h-16', order: 2 },
]

function initials(name: string | null) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

export default async function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: league } = await supabase
    .from('leagues')
    .select('name, commissioner_id')
    .eq('id', id)
    .maybeSingle()

  if (!league) notFound()

  const { data: members } = await supabase
    .from('league_members')
    .select('id, team_name, total_points, budget_remaining, user_id, profiles(display_name)')
    .eq('league_id', id)
    .order('total_points', { ascending: false })

  if (!members) notFound()

  const typedMembers = members as unknown as MemberRow[]
  const isMember = typedMembers.some(m => m.user_id === user.id)
  if (!isMember) redirect('/dashboard')

  const myRank = typedMembers.findIndex(m => m.user_id === user.id) + 1
  const leagueData = league as { name: string; commissioner_id: string }
  const top3 = typedMembers.slice(0, 3)
  const rest = typedMembers.slice(3)

  // Reorder top3 for podium: 2nd, 1st, 3rd (display order)
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <FadeUp>
        <div className="flex items-center gap-3">
          <Link
            href={`/leagues/${id}`}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-[#5a7a9a] hover:text-white')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="type-heading text-white">{leagueData.name}</h1>
            <p className="type-label text-[#00d4ff]/50 mt-0.5">Leaderboard</p>
          </div>
        </div>
      </FadeUp>

      {/* My rank banner */}
      {myRank > 0 && (
        <FadeUp delay={0.1}>
          <div
            className="flex items-center justify-between px-5 py-3 rounded-xl border"
            style={{
              background: 'rgba(255,107,0,0.06)',
              borderColor: 'rgba(255,107,0,0.25)',
              boxShadow: 'none',
            }}
          >
            <span className="type-label text-[#ff6b00]">Your Rank</span>
            <span className="type-rank" style={{ color: '#ff6b00' }}>#{myRank}</span>
          </div>
        </FadeUp>
      )}

      {/* ── Podium (top 3) ── */}
      {top3.length > 0 && (
        <FadeUp delay={0.15}>
          <div className="section-label mb-4">Podium</div>
          <div className="flex items-end justify-center gap-3 px-4">
            {podiumOrder.map((m, displayIdx) => {
              if (!m) return null
              const actualRank = typedMembers.findIndex(x => x.id === m.id)
              const cfg = PODIUM_CONFIG[actualRank]
              const isMe = m.user_id === user.id
              const pts = Number(m.total_points)

              return (
                <div
                  key={m.id}
                  className="flex-1 flex flex-col items-center gap-2"
                  style={{ order: cfg.order }}
                >
                  {/* Crown for #1 */}
                  {actualRank === 0 && (
                    <Crown className="w-5 h-5" style={{ color: '#F59E0B' }} />
                  )}

                  {/* Avatar */}
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-black font-orbitron border-2 transition-transform hover:scale-105"
                    style={{
                      background: 'rgba(8,14,28,0.9)',
                      borderColor: cfg.labelColor,
                      color: cfg.labelColor,
                      boxShadow: 'none',
                    }}
                  >
                    {initials(m.team_name)}
                  </div>

                  {/* Podium block */}
                  <div
                    className={`w-full ${cfg.height} rounded-t-xl flex flex-col items-center justify-end pb-3 border border-b-0`}
                    style={{
                      background: `linear-gradient(180deg, ${cfg.labelColor}12 0%, rgba(8,14,28,0.9) 100%)`,
                      borderColor: cfg.labelColor + '60',
                      boxShadow: cfg.glow,
                    }}
                  >
                    <p className="type-score-sm leading-none" style={{ color: cfg.labelColor }}>
                      {pts.toFixed(1)}
                    </p>
                    <p className="type-label text-[#5a7a9a] mt-0.5">pts</p>
                  </div>

                  {/* Name */}
                  <div className="text-center">
                    <p className="type-player-name text-white line-clamp-1">
                      {m.team_name ?? 'Unnamed'}
                      {isMe && <span className="text-[#ff6b00] ml-1">·</span>}
                    </p>
                    <p className="type-caption text-[#5a7a9a]">
                      {m.profiles?.display_name ?? ''}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </FadeUp>
      )}

      {/* ── Remaining ranks ── */}
      {(rest.length > 0 || typedMembers.length > 0) && (
        <FadeUp delay={0.2}>
          <div className="section-label mb-4">
            {top3.length >= 3 ? 'Other Rankings' : 'Rankings'}
          </div>
          <div className="card-hud rounded-2xl overflow-hidden">
            <StaggerList>
              {(top3.length < 3 ? typedMembers : rest).map((m, localIdx) => {
                const rank = top3.length < 3 ? localIdx + 1 : localIdx + 4
                const isMe = m.user_id === user.id
                const pts = Number(m.total_points)

                return (
                  <StaggerItem key={m.id}>
                    <div
                      className={cn(
                        'rank-row-accent flex items-center justify-between px-5 py-3.5 transition-colors',
                        isMe ? 'bg-[#ff6b00]/6' : 'hover:bg-[#00d4ff]/3',
                        localIdx > 0 && 'border-t border-[#0e2040]/60'
                      )}
                    >
                      {/* Rank number */}
                      <div className="w-8 shrink-0 text-center">
                        <span className="type-numeric text-xs text-[#5a7a9a]">#{rank}</span>
                      </div>

                      {/* Avatar + name */}
                      <div className="flex items-center gap-3 flex-1 min-w-0 ml-2">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center type-player-name shrink-0"
                          style={{
                            background: isMe ? 'rgba(255,107,0,0.12)' : 'rgba(0,212,255,0.06)',
                            color: isMe ? '#ff6b00' : '#00d4ff',
                            border: `1px solid ${isMe ? 'rgba(255,107,0,0.3)' : 'rgba(0,212,255,0.15)'}`,
                          }}
                        >
                          {initials(m.team_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="type-player-name text-white truncate">
                            {m.team_name ?? 'Unnamed'}
                            {isMe && (
                              <span
                                className="ml-1.5 type-label px-1.5 py-0.5 rounded"
                                style={{ background: 'rgba(255,107,0,0.15)', color: '#ff6b00' }}
                              >
                                You
                              </span>
                            )}
                          </p>
                          <p className="type-caption text-[#5a7a9a] truncate">
                            {m.profiles?.display_name ?? ''}
                          </p>
                        </div>
                      </div>

                      {/* Points */}
                      <div className="text-right shrink-0">
                        <p className="type-score-sm leading-none" style={{ color: '#ff6b00' }}>
                          {pts.toFixed(1)}
                        </p>
                        <p className="type-label text-[#5a7a9a] mt-0.5">pts</p>
                      </div>
                    </div>
                  </StaggerItem>
                )
              })}
            </StaggerList>
          </div>
        </FadeUp>
      )}
    </div>
  )
}
