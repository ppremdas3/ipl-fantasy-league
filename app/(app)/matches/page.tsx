import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MatchesTabs from '@/components/matches/MatchesTabs'
import { Card, CardContent } from '@/components/ui/card'

export default async function MatchesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: matches } = await supabase
    .from('ipl_matches')
    .select('id, match_number, team1, team2, venue, scheduled_at, status, result')
    .order('match_number')

  const all = (matches ?? []) as {
    id: string
    match_number: number
    team1: string
    team2: string
    venue: string | null
    scheduled_at: string | null
    status: string
    result: string | null
  }[]

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white">IPL 2026</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{all.length} matches · Season schedule</p>
      </div>

      {all.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center text-muted-foreground text-sm">
            No matches scheduled yet. Commissioner can add them via the Admin panel.
          </CardContent>
        </Card>
      ) : (
        <MatchesTabs matches={all} />
      )}
    </div>
  )
}
