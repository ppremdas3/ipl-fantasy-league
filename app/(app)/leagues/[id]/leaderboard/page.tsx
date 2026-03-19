import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

type MemberRow = {
  id: string
  team_name: string | null
  total_points: number
  budget_remaining: number | null
  user_id: string
  profiles: { display_name: string } | null
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
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/leagues/${id}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground')}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">{(league as { name: string }).name}</h1>
          <p className="text-sm text-muted-foreground">Leaderboard</p>
        </div>
      </div>

      {myRank > 0 && (
        <Card className="bg-[#ff6b00]/10 border-[#ff6b00]/30">
          <CardContent className="py-3 px-4 flex justify-between items-center">
            <span className="text-sm text-[#ff6b00] font-medium">Your rank</span>
            <span className="font-black text-xl text-[#ff6b00]">#{myRank}</span>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Standings</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="divide-y divide-border">
            {typedMembers.map((m, i) => {
              const isMe = m.user_id === user.id
              return (
                <div key={m.id} className={`flex items-center justify-between px-6 py-4 ${isMe ? 'bg-[#ff6b00]/5' : ''}`}>
                  <div className="flex items-center gap-4">
                    <span className="text-xl w-8 text-center">
                      {i < 3 ? medals[i] : <span className="text-muted-foreground text-sm font-mono">#{i + 1}</span>}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{m.team_name ?? 'Unnamed'}</p>
                        {isMe && <Badge className="text-xs bg-[#ff6b00]/20 text-[#ff6b00] border-[#ff6b00]/30">You</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{m.profiles?.display_name ?? ''}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-lg text-[#ff6b00]">{Number(m.total_points).toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">points</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
