import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { Badge } from '@/components/ui/badge'
import { Plus, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('league_members')
    .select(`
      id,
      team_name,
      budget_remaining,
      total_points,
      league:leagues (
        id, name, invite_code, status, commissioner_id, budget_per_team
      )
    `)
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle()

  const statusColor: Record<string, string> = {
    setup: 'bg-muted text-muted-foreground',
    auction: 'bg-[#ff6b00]/20 text-[#ff6b00]',
    live: 'bg-green-500/20 text-green-400',
    completed: 'bg-muted text-muted-foreground',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome, {(profile as { display_name: string } | null)?.display_name ?? 'Champion'}! 🏏
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Your IPL Fantasy leagues</p>
        </div>
        <div className="flex gap-2">
          <Link href="/leagues/join" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'border-border hover:border-[#ff6b00]')}>
            <Users className="w-4 h-4 mr-1.5" />
            Join
          </Link>
          <Link href="/leagues/new" className={cn(buttonVariants({ size: 'sm' }), 'bg-[#ff6b00] hover:bg-[#e55c00] text-white')}>
            <Plus className="w-4 h-4 mr-1.5" />
            Create League
          </Link>
        </div>
      </div>

      {!memberships || memberships.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <p className="text-4xl mb-4">🏟️</p>
            <p className="text-muted-foreground mb-4">You haven&apos;t joined any leagues yet.</p>
            <div className="flex gap-3 justify-center">
              <Link href="/leagues/join" className={cn(buttonVariants({ variant: 'outline' }), 'border-border hover:border-[#ff6b00]')}>
                Join a league
              </Link>
              <Link href="/leagues/new" className={cn(buttonVariants(), 'bg-[#ff6b00] hover:bg-[#e55c00] text-white')}>
                Create one
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {memberships.map((m) => {
            const league = m.league as unknown as { id: string; name: string; invite_code: string; status: string; commissioner_id: string; budget_per_team: number } | null
            if (!league) return null
            const isCommissioner = league.commissioner_id === user.id
            return (
              <Card key={m.id} className="bg-card border-border hover:border-[#ff6b00]/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base text-foreground line-clamp-1">{league.name}</CardTitle>
                    <Badge className={`text-xs shrink-0 ${statusColor[league.status] ?? ''}`}>
                      {league.status}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {m.team_name ?? 'No team name set'}{isCommissioner ? ' · Commissioner' : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Points</span>
                    <span className="font-bold text-[#ff6b00]">{Number(m.total_points).toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Budget left</span>
                    <span className="font-mono text-[#00d4aa]">
                      ₹{((m.budget_remaining ?? league.budget_per_team) / 100).toFixed(0)}Cr
                    </span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Link href={`/leagues/${league.id}`} className={cn(buttonVariants({ size: 'sm' }), 'flex-1 bg-[#ff6b00] hover:bg-[#e55c00] text-white text-xs text-center')}>
                      View League
                    </Link>
                    {league.status === 'auction' && (
                      <Link href={`/leagues/${league.id}/auction`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'flex-1 border-[#ff6b00] text-[#ff6b00] text-xs hover:bg-[#ff6b00]/10 text-center')}>
                        Auction 🔴
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
