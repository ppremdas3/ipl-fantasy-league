import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuctionRoom from '@/components/auction/AuctionRoom'

export default async function AuctionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: league } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', id)
    .single()

  if (!league) notFound()
  if (league.status !== 'auction') redirect(`/leagues/${id}`)

  const { data: myMembership } = await supabase
    .from('league_members')
    .select('*')
    .eq('league_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!myMembership) redirect('/dashboard')

  const { data: members } = await supabase
    .from('league_members')
    .select('*, profiles(display_name)')
    .eq('league_id', id)

  const { data: session } = await supabase
    .from('auction_sessions')
    .select('*')
    .eq('league_id', id)
    .maybeSingle()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{league.name} — Auction</h1>
      </div>
      <AuctionRoom
        leagueId={id}
        userId={user.id}
        isCommissioner={league.commissioner_id === user.id}
        initialSession={session}
        initialMembers={(members ?? []) as Parameters<typeof AuctionRoom>[0]['initialMembers']}
        league={league}
        myMemberId={myMembership.id}
      />
    </div>
  )
}
