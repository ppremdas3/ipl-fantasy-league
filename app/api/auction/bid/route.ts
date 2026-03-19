import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const MIN_BID_INCREMENT = 25 // lakhs

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )

  // Auth check using anon client first
  const anonSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )

  const { data: { user } } = await anonSupabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { amount, session_id, league_id } = body

  if (!amount || !session_id || !league_id) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Fetch current session
  const { data: session, error: sessionErr } = await supabase
    .from('auction_sessions')
    .select('*')
    .eq('id', session_id)
    .eq('league_id', league_id)
    .single()

  if (sessionErr || !session) {
    return Response.json({ error: 'Auction session not found' }, { status: 404 })
  }

  if (session.status !== 'active') {
    return Response.json({ error: 'Auction is not active right now' }, { status: 400 })
  }

  // Check timer not expired (with 2s grace)
  if (session.timer_end) {
    const timerEnd = new Date(session.timer_end).getTime()
    if (Date.now() > timerEnd + 2000) {
      return Response.json({ error: 'Bid timer has expired' }, { status: 400 })
    }
  }

  // Check bid amount is valid
  const currentBid = session.current_highest_bid ?? 0
  if (amount < currentBid + MIN_BID_INCREMENT) {
    return Response.json({
      error: `Minimum bid is ₹${currentBid + MIN_BID_INCREMENT}L (increment: ₹${MIN_BID_INCREMENT}L)`,
    }, { status: 400 })
  }

  // Get the bidder's league_member record
  const { data: member } = await supabase
    .from('league_members')
    .select('id, budget_remaining')
    .eq('league_id', league_id)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return Response.json({ error: 'You are not in this league' }, { status: 403 })
  }

  const budget = member.budget_remaining ?? 0
  if (amount > budget) {
    return Response.json({ error: `Insufficient budget. You have ₹${budget}L remaining.` }, { status: 400 })
  }

  // Cannot bid on yourself (already highest bidder)
  if (session.current_highest_bidder_id === member.id) {
    return Response.json({ error: 'You are already the highest bidder' }, { status: 400 })
  }

  // All validations passed — extend timer by 10s and update session
  const newTimerEnd = new Date(Date.now() + 10000).toISOString()

  const { error: updateErr } = await supabase
    .from('auction_sessions')
    .update({
      current_highest_bid: amount,
      current_highest_bidder_id: member.id,
      timer_end: newTimerEnd,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session_id)

  if (updateErr) {
    return Response.json({ error: 'Failed to update bid' }, { status: 500 })
  }

  // Record bid history
  await supabase.from('auction_bids').insert({
    session_id,
    league_id,
    player_id: session.current_player_id!,
    bidder_id: member.id,
    amount,
  })

  return Response.json({ success: true, amount, timer_end: newTimerEnd })
}
