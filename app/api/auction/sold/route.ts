import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()

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

  const { data: { user } } = await anonSupabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { league_id, mark_unsold } = await request.json()

  // Verify commissioner
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', league_id)
    .single()

  if (!league || league.commissioner_id !== user.id) {
    return Response.json({ error: 'Only the commissioner can finalize the auction' }, { status: 403 })
  }

  // Get current session
  const { data: session } = await supabase
    .from('auction_sessions')
    .select('*')
    .eq('league_id', league_id)
    .single()

  if (!session || !session.current_player_id) {
    return Response.json({ error: 'No active auction session' }, { status: 400 })
  }

  if (mark_unsold || !session.current_highest_bidder_id) {
    // Mark as unsold, reset session
    await supabase
      .from('auction_sessions')
      .update({ status: 'unsold', updated_at: new Date().toISOString() })
      .eq('league_id', league_id)

    return Response.json({ success: true, status: 'unsold' })
  }

  // Mark as sold
  const { error: tpErr } = await supabase
    .from('team_players')
    .insert({
      league_id,
      member_id: session.current_highest_bidder_id,
      player_id: session.current_player_id,
      purchase_price: session.current_highest_bid!,
    })

  if (tpErr) return Response.json({ error: tpErr.message }, { status: 500 })

  // Deduct budget from winner
  const { data: winnerMember } = await supabase
    .from('league_members')
    .select('budget_remaining')
    .eq('id', session.current_highest_bidder_id)
    .single()

  if (winnerMember) {
    await supabase
      .from('league_members')
      .update({
        budget_remaining: (winnerMember.budget_remaining ?? 0) - session.current_highest_bid!,
      })
      .eq('id', session.current_highest_bidder_id)
  }

  // Update session status to sold
  await supabase
    .from('auction_sessions')
    .update({
      status: 'sold',
      updated_at: new Date().toISOString(),
    })
    .eq('league_id', league_id)

  return Response.json({
    success: true,
    status: 'sold',
    player_id: session.current_player_id,
    sold_to: session.current_highest_bidder_id,
    price: session.current_highest_bid,
  })
}
