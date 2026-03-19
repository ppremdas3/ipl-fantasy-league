import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button-variants'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Trophy, Users, Zap, ChevronRight, Crown } from 'lucide-react'
import CopyInviteButton from './CopyInviteButton'

const TEAM_BADGE_COLORS: Record<string, string> = {
  MI: 'bg-blue-500/20 text-blue-300',
  CSK: 'bg-yellow-500/20 text-yellow-300',
  RCB: 'bg-red-500/20 text-red-300',
  KKR: 'bg-purple-500/20 text-purple-300',
  RR: 'bg-pink-500/20 text-pink-300',
  DC: 'bg-sky-500/20 text-sky-300',
  PBKS: 'bg-rose-500/20 text-rose-300',
  SRH: 'bg-orange-500/20 text-orange-300',
  LSG: 'bg-lime-500/20 text-lime-300',
  GT: 'bg-indigo-500/20 text-indigo-300',
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-white">{l.name}</h1>
            <span className={cn(
              'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium',
              l.status === 'live' ? 'bg-green-500/15 text-green-400' : 'bg-muted/50 text-muted-foreground'
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full', l.status === 'live' ? 'bg-green-400' : 'bg-muted-foreground')} />
              {l.status}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <span>Code:</span>
            <code className="bg-muted px-2 py-0.5 rounded font-mono text-[#ff6b00]">{l.invite_code}</code>
            <CopyInviteButton code={l.invite_code} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`/leagues/${id}/team`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'border-border hover:border-[#ff6b00]/50 text-muted-foreground hover:text-white')}>
            My Team
          </Link>
          <Link href={`/leagues/${id}/leaderboard`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'border-border hover:border-[#ff6b00]/50 text-muted-foreground hover:text-white')}>
            Leaderboard
          </Link>
          {currentGameweek && !isPastDeadline && (
            <Link href={`/leagues/${id}/select`} className={cn(buttonVariants({ size: 'sm' }), 'bg-[#ff6b00] hover:bg-[#e55c00] text-white gap-1.5 glow-orange')}>
              <Zap className="w-3.5 h-3.5" />
              Select Team — {currentGameweek.name}
            </Link>
          )}
          {isCommissioner && l.status === 'setup' && (
            <GoLiveButton leagueId={id} />
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <div className="w-8 h-8 rounded-xl bg-[#ff6b00]/10 flex items-center justify-center mx-auto mb-2">
            <Users className="w-4 h-4 text-[#ff6b00]" />
          </div>
          <p className="text-2xl font-black text-[#ff6b00]">{members?.length ?? 0}<span className="text-muted-foreground font-normal text-sm">/{l.max_teams}</span></p>
          <p className="text-xs text-muted-foreground mt-0.5">Teams</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <div className="w-8 h-8 rounded-xl bg-[#22c55e]/10 flex items-center justify-center mx-auto mb-2">
            <Trophy className="w-4 h-4 text-[#22c55e]" />
          </div>
          <p className="text-2xl font-black text-[#22c55e]">{Number(myMembership.total_points).toFixed(1)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Your Points</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-2">
            <Crown className="w-4 h-4 text-white/60" />
          </div>
          <p className="text-2xl font-black text-white">#{myRank}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Your Rank</p>
        </div>
      </div>

      {/* Gameweek deadline banner */}
      {currentGameweek && (
        <div className={cn(
          'rounded-2xl border p-4 flex items-center justify-between text-sm',
          isPastDeadline
            ? 'border-border bg-card/50 text-muted-foreground'
            : 'border-[#ff6b00]/30 bg-[#ff6b00]/5'
        )}>
          <div className="flex items-center gap-2">
            {!isPastDeadline && <Zap className="w-4 h-4 text-[#ff6b00]" />}
            <span className={isPastDeadline ? '' : 'text-white font-medium'}>
              {currentGameweek.name} — {isPastDeadline ? 'team selection closed' : 'team selection open'}
            </span>
          </div>
          <span className="text-xs">
            Deadline: {new Date(currentGameweek.deadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* Teams table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-bold text-white">Teams</h2>
        </div>
        <div className="divide-y divide-border/50">
          {(members as { id: string; team_name: string | null; total_points: number; user_id: string; profiles: { display_name: string } | null }[] | null)?.map((m, i) => {
            const isMe = m.user_id === user.id
            const pts = Number(m.total_points)
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null

            return (
              <div key={m.id} className={cn('flex items-center justify-between px-5 py-3.5', isMe && 'bg-[#ff6b00]/5')}>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-sm w-8 tabular-nums">
                    {medal ?? `#${i + 1}`}
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#ff6b00]/20 to-[#ff6b00]/5 flex items-center justify-center text-[#ff6b00] font-bold text-sm">
                    {(m.team_name ?? m.profiles?.display_name ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-white">
                      {m.team_name ?? 'Unnamed Team'}
                      {isMe && <span className="ml-2 text-xs text-[#ff6b00]">You</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{m.profiles?.display_name ?? ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-black text-[#ff6b00] tabular-nums">{pts.toFixed(1)}</p>
                  <span className="text-xs text-muted-foreground">pts</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
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
      <button type="submit" className={cn(buttonVariants({ size: 'sm' }), 'bg-green-600 hover:bg-green-700 text-white gap-1.5')}>
        <Zap className="w-3.5 h-3.5" />
        Go Live
      </button>
    </form>
  )
}
