import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function MatchesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: matches } = await supabase
    .from('ipl_matches')
    .select('*')
    .order('match_number')

  const statusColor: Record<string, string> = {
    upcoming: 'bg-muted text-muted-foreground',
    live: 'bg-green-500/20 text-green-400',
    completed: 'bg-blue-500/20 text-blue-400',
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">IPL 2026 Matches</h1>
      {!matches || matches.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center text-muted-foreground">
            No matches scheduled yet. Commissioner can add them via Admin panel.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {matches.map(m => (
            <Card key={m.id} className="bg-card border-border hover:border-[#ff6b00]/40 transition-colors">
              <CardContent className="py-4 px-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">#{m.match_number}</span>
                      <Badge className={`text-xs ${statusColor[m.status]}`}>{m.status}</Badge>
                    </div>
                    <p className="font-bold text-lg">
                      <span className="text-[#ff6b00]">{m.team1}</span>
                      <span className="text-muted-foreground mx-2">vs</span>
                      <span className="text-[#00d4aa]">{m.team2}</span>
                    </p>
                    {m.venue && <p className="text-xs text-muted-foreground mt-0.5">{m.venue}</p>}
                  </div>
                  {m.scheduled_at && (
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium">
                        {new Date(m.scheduled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(m.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )}
                </div>
                {m.result && (
                  <p className="text-xs text-[#00d4aa] mt-2 pt-2 border-t border-border">{m.result}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
