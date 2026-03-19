'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { AuctionSession, AuctionBid, IplPlayer, League, LeagueMember } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import AuctionTimer from './AuctionTimer'
import PlayerCard from './PlayerCard'
import BidButton from './BidButton'
import CommissionerControls from './CommissionerControls'

interface Props {
  leagueId: string
  userId: string
  isCommissioner: boolean
  initialSession: AuctionSession | null
  initialMembers: (LeagueMember & { profiles: { display_name: string } | null })[]
  league: League
  myMemberId: string
}

export default function AuctionRoom({
  leagueId, userId, isCommissioner, initialSession, initialMembers, league, myMemberId,
}: Props) {
  const supabase = createClient()
  const [session, setSession] = useState<AuctionSession | null>(initialSession)
  const [members, setMembers] = useState(initialMembers)
  const [currentPlayer, setCurrentPlayer] = useState<IplPlayer | null>(null)
  const [recentBids, setRecentBids] = useState<(AuctionBid & { member_name: string })[]>([])
  const [bidding, setBidding] = useState(false)

  // Fetch current player details when session changes
  const fetchCurrentPlayer = useCallback(async (playerId: string | null) => {
    if (!playerId) { setCurrentPlayer(null); return }
    const { data } = await supabase.from('ipl_players').select('*').eq('id', playerId).single()
    setCurrentPlayer(data)
  }, [supabase])

  // Fetch recent bids
  const fetchRecentBids = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from('auction_bids')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(5)
    if (data) {
      const bidsWithNames = data.map(bid => ({
        ...bid,
        member_name: members.find(m => m.id === bid.bidder_id)?.team_name ?? 'Unknown',
      }))
      setRecentBids(bidsWithNames)
    }
  }, [supabase, members])

  // Refresh members (budget updates)
  const refreshMembers = useCallback(async () => {
    const { data } = await supabase
      .from('league_members')
      .select('*, profiles(display_name)')
      .eq('league_id', leagueId)
    if (data) setMembers(data as typeof initialMembers)
  }, [supabase, leagueId])

  useEffect(() => {
    if (session?.current_player_id) {
      fetchCurrentPlayer(session.current_player_id)
    }
    if (session?.id) {
      fetchRecentBids(session.id)
    }
  }, [session, fetchCurrentPlayer, fetchRecentBids])

  // Subscribe to Supabase Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`auction:${leagueId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'auction_sessions',
        filter: `league_id=eq.${leagueId}`,
      }, (payload) => {
        const newSession = payload.new as AuctionSession
        setSession(newSession)
        if (newSession.status === 'sold') {
          toast.success('🔨 SOLD!', { description: `Player sold for ₹${newSession.current_highest_bid}L` })
          refreshMembers()
        } else if (newSession.status === 'unsold') {
          toast.info('Player went unsold')
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'auction_bids',
        filter: `league_id=eq.${leagueId}`,
      }, (payload) => {
        const bid = payload.new as AuctionBid
        const bidderName = members.find(m => m.id === bid.bidder_id)?.team_name ?? 'Someone'
        if (bid.bidder_id !== myMemberId) {
          toast.info(`${bidderName} bid ₹${bid.amount}L`)
        }
        setRecentBids(prev => [{
          ...bid,
          member_name: bidderName,
        }, ...prev].slice(0, 5))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, leagueId, members, myMemberId, refreshMembers])

  async function handleBid(amount: number) {
    if (!session) return
    setBidding(true)
    try {
      const res = await fetch('/api/auction/bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, session_id: session.id, league_id: leagueId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error)
      } else {
        toast.success(`Bid placed: ₹${amount}L`)
      }
    } finally {
      setBidding(false)
    }
  }

  const myMember = members.find(m => m.id === myMemberId)
  const highestBidder = members.find(m => m.id === session?.current_highest_bidder_id)
  const isHighestBidder = session?.current_highest_bidder_id === myMemberId
  const currentBid = session?.current_highest_bid ?? 0
  const myBudget = myMember?.budget_remaining ?? 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main auction panel */}
      <div className="lg:col-span-2 space-y-4">
        {/* Status banner */}
        <div className={`rounded-xl px-4 py-2 text-center text-sm font-medium ${
          session?.status === 'active' ? 'bg-[#ff6b00]/20 text-[#ff6b00] glow-orange' :
          session?.status === 'sold' ? 'bg-green-500/20 text-green-400' :
          session?.status === 'unsold' ? 'bg-muted text-muted-foreground' :
          'bg-muted text-muted-foreground'
        }`}>
          {session?.status === 'active' && '🔴 AUCTION IN PROGRESS'}
          {session?.status === 'sold' && '🔨 SOLD!'}
          {session?.status === 'unsold' && 'No bids — player unsold'}
          {session?.status === 'waiting' && '⏳ Waiting for commissioner to start…'}
          {session?.status === 'completed' && '✅ Auction Complete'}
          {!session && '⏳ Waiting for auction to start…'}
        </div>

        {/* Player card */}
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            {currentPlayer && session?.status === 'active' ? (
              <PlayerCard player={currentPlayer} />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                {session?.status === 'waiting' ? 'Commissioner will put up the next player' : 'No player on auction'}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bid info */}
        {session?.status === 'active' && (
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-card border-border text-center">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-1">Current Bid</p>
                <p className="text-2xl font-black text-[#ff6b00]">₹{currentBid}L</p>
              </CardContent>
            </Card>
            <Card className={`border text-center ${isHighestBidder ? 'border-[#00d4aa] bg-[#00d4aa]/10' : 'bg-card border-border'}`}>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-1">Leader</p>
                <p className="text-sm font-bold truncate">
                  {highestBidder?.team_name ?? '—'}
                </p>
                {isHighestBidder && <Badge className="text-xs bg-[#00d4aa]/20 text-[#00d4aa] mt-1">You! 🏆</Badge>}
              </CardContent>
            </Card>
            <Card className="bg-card border-border text-center">
              <CardContent className="pt-4 pb-4">
                <AuctionTimer timerEnd={session.timer_end} />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Bid buttons */}
        {session?.status === 'active' && !isCommissioner && (
          <BidButton
            currentBid={currentBid}
            myBudget={myBudget}
            isHighestBidder={isHighestBidder}
            onBid={handleBid}
            loading={bidding}
          />
        )}

        {/* Commissioner controls */}
        {isCommissioner && (
          <CommissionerControls
            leagueId={leagueId}
            session={session}
            currentPlayer={currentPlayer}
          />
        )}

        {/* Recent bids */}
        {recentBids.length > 0 && (
          <Card className="bg-card border-border">
            <CardContent className="pt-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Recent bids</p>
              <div className="space-y-1">
                {recentBids.map((bid, i) => (
                  <div key={bid.id} className={`flex justify-between text-sm ${i === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    <span>{bid.member_name}</span>
                    <span className="font-mono">₹{bid.amount}L</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sidebar: budgets */}
      <div className="space-y-4">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Team Budgets</h3>
        {members.map(m => (
          <Card key={m.id} className={`border ${m.id === myMemberId ? 'border-[#ff6b00]/50' : 'border-border'} bg-card`}>
            <CardContent className="py-3 px-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium truncate">{m.team_name ?? 'Unnamed'}</p>
                  {m.id === myMemberId && <p className="text-xs text-[#ff6b00]">You</p>}
                </div>
                <p className="text-sm font-mono text-[#00d4aa]">
                  ₹{((m.budget_remaining ?? 0) / 100).toFixed(0)}Cr
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
