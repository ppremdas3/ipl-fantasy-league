import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import CopyInviteButton from './CopyInviteButton'

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
    .select('id, team_name, total_points, budget_remaining, user_id, profiles(display_name)')
    .eq('league_id', id)
    .order('total_points', { ascending: false })

  const l = league as { id: string; name: string; invite_code: string; commissioner_id: string; status: string; max_teams: number; budget_per_team: number }
  const isCommissioner = l.commissioner_id === user.id

  const statusColor: Record<string, string> = {
    setup: 'bg-muted text-muted-foreground',
    auction: 'bg-[#ff6b00]/20 text-[#ff6b00]',
    live: 'bg-green-500/20 text-green-400',
    completed: 'bg-muted text-muted-foreground',
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{l.name}</h1>
            <Badge className={statusColor[l.status]}>{l.status}</Badge>
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <span>Invite code:</span>
            <code className="bg-muted px-2 py-0.5 rounded font-mono text-[#ff6b00]">{l.invite_code}</code>
            <CopyInviteButton code={l.invite_code} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`/leagues/${id}/team`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'border-border hover:border-[#ff6b00]')}>
            My Team
          </Link>
          <Link href={`/leagues/${id}/leaderboard`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'border-border hover:border-[#ff6b00]')}>
            Leaderboard
          </Link>
          {l.status === 'auction' && (
            <Link href={`/leagues/${id}/auction`} className={cn(buttonVariants({ size: 'sm' }), 'bg-[#ff6b00] hover:bg-[#e55c00] text-white glow-orange')}>
              🔴 Live Auction
            </Link>
          )}
          {isCommissioner && l.status === 'setup' && (
            <StartAuctionButton leagueId={id} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Teams</p>
            <p className="text-2xl font-bold text-[#ff6b00]">{members?.length ?? 0}/{l.max_teams}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Your points</p>
            <p className="text-2xl font-bold text-[#00d4aa]">{Number(myMembership.total_points).toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Budget left</p>
            <p className="text-2xl font-bold">
              ₹{((Number(myMembership.budget_remaining) ?? l.budget_per_team) / 100).toFixed(0)}Cr
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Your rank</p>
            <p className="text-2xl font-bold">
              #{((members as { user_id: string }[] | null)?.findIndex(m => m.user_id === user.id) ?? 0) + 1}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Teams</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {(members as { id: string; team_name: string | null; total_points: number; budget_remaining: number | null; user_id: string; profiles: { display_name: string } | null }[] | null)?.map((m, i) => (
              <div key={m.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-sm w-6">#{i + 1}</span>
                  <div>
                    <p className="font-medium text-sm">{m.team_name ?? 'Unnamed Team'}</p>
                    <p className="text-xs text-muted-foreground">{m.profiles?.display_name ?? ''}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[#ff6b00] text-sm">{Number(m.total_points).toFixed(1)} pts</p>
                  <p className="text-xs text-muted-foreground">₹{((m.budget_remaining ?? 0) / 100).toFixed(0)}Cr left</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StartAuctionButton({ leagueId }: { leagueId: string }) {
  return (
    <form action={async () => {
      'use server'
      const { createClient, createAdminClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const admin = await createAdminClient()
      await admin.from('leagues').update({ status: 'auction' }).eq('id', leagueId)
      await admin.from('auction_sessions').upsert({ league_id: leagueId, status: 'waiting' })
      redirect(`/leagues/${leagueId}/auction`)
    }}>
      <button type="submit" className={cn(buttonVariants({ size: 'sm' }), 'bg-green-600 hover:bg-green-700 text-white')}>
        Start Auction
      </button>
    </form>
  )
}
