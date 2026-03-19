import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button-variants'
import { Plus, Users, Trophy, ChevronRight, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  setup:     { label: 'Setup',     color: 'text-muted-foreground bg-muted/50',    dot: 'bg-muted-foreground' },
  live:      { label: 'Live',      color: 'text-green-400 bg-green-500/15',       dot: 'bg-green-400' },
  completed: { label: 'Completed', color: 'text-muted-foreground bg-muted/50',    dot: 'bg-muted-foreground' },
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
  const firstName = displayName.split(' ')[0]

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Welcome back</p>
          <h1 className="text-3xl font-black text-white">
            {firstName} <span className="text-[#ff6b00]">🏏</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/leagues/join"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'border-border hover:border-[#ff6b00]/50 text-muted-foreground hover:text-white gap-1.5')}
          >
            <Users className="w-3.5 h-3.5" />
            Join
          </Link>
          <Link
            href="/leagues/new"
            className={cn(buttonVariants({ size: 'sm' }), 'bg-[#ff6b00] hover:bg-[#e55c00] text-white gap-1.5')}
          >
            <Plus className="w-3.5 h-3.5" />
            Create League
          </Link>
        </div>
      </div>

      {!memberships || memberships.length === 0 ? (
        /* Empty state */
        <div className="rounded-2xl border border-dashed border-border bg-card/40 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#ff6b00]/10 flex items-center justify-center text-3xl mx-auto mb-4">
            🏟️
          </div>
          <h2 className="text-lg font-bold text-white mb-2">No leagues yet</h2>
          <p className="text-muted-foreground text-sm mb-6">Create or join a league to start playing</p>
          <div className="flex gap-3 justify-center">
            <Link href="/leagues/join" className={cn(buttonVariants({ variant: 'outline' }), 'border-border hover:border-[#ff6b00]/50')}>
              Join a league
            </Link>
            <Link href="/leagues/new" className={cn(buttonVariants(), 'bg-[#ff6b00] hover:bg-[#e55c00] text-white')}>
              Create one
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {memberships.map((m) => {
            const league = m.league as unknown as { id: string; name: string; status: string; commissioner_id: string; budget_per_team: number } | null
            if (!league) return null
            const isCommissioner = league.commissioner_id === user.id
            const status = STATUS_CONFIG[league.status] ?? STATUS_CONFIG.setup
            const points = Number(m.total_points)

            return (
              <Link
                key={m.id}
                href={`/leagues/${league.id}`}
                className="group relative bg-card border border-border rounded-2xl p-5 hover:border-[#ff6b00]/40 transition-all hover:shadow-lg hover:shadow-[#ff6b00]/5 block"
              >
                {/* Status badge */}
                <div className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium mb-3 ${status.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </div>

                <h3 className="font-bold text-white text-base leading-tight line-clamp-1 mb-1">
                  {league.name}
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  {m.team_name ?? 'No team name'}{isCommissioner ? ' · Commissioner' : ''}
                </p>

                {/* Points display */}
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total points</p>
                    <p className="text-3xl font-black text-[#ff6b00] tabular-nums leading-none">
                      {points.toFixed(1)}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#ff6b00]/10 group-hover:bg-[#ff6b00]/20 flex items-center justify-center transition-colors">
                    <ChevronRight className="w-5 h-5 text-[#ff6b00]" />
                  </div>
                </div>

                {/* Bottom icons */}
                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/50">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Trophy className="w-3.5 h-3.5" />
                    League
                  </div>
                  {league.status === 'live' && (
                    <div className="flex items-center gap-1.5 text-xs text-[#22c55e]">
                      <Zap className="w-3.5 h-3.5" />
                      Select Team
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
