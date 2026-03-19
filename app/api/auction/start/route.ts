import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const INITIAL_TIMER_SECONDS = 30

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

  const { league_id, player_id } = await request.json()

  // Verify commissioner
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id, status')
    .eq('id', league_id)
    .single()

  if (!league || league.commissioner_id !== user.id) {
    return Response.json({ error: 'Only the commissioner can start the auction' }, { status: 403 })
  }

  if (league.status !== 'auction') {
    return Response.json({ error: 'League is not in auction mode' }, { status: 400 })
  }

  // Check player is not already sold
  const { data: existingOwner } = await supabase
    .from('team_players')
    .select('id')
    .eq('league_id', league_id)
    .eq('player_id', player_id)
    .maybeSingle()

  if (existingOwner) {
    return Response.json({ error: 'This player has already been sold' }, { status: 400 })
  }

  // Get player base price
  const { data: player } = await supabase
    .from('ipl_players')
    .select('base_price')
    .eq('id', player_id)
    .single()

  if (!player) return Response.json({ error: 'Player not found' }, { status: 404 })

  const timerEnd = new Date(Date.now() + INITIAL_TIMER_SECONDS * 1000).toISOString()

  const { error } = await supabase
    .from('auction_sessions')
    .upsert({
      league_id,
      current_player_id: player_id,
      current_highest_bid: player.base_price,
      current_highest_bidder_id: null,
      timer_end: timerEnd,
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'league_id' })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ success: true, timer_end: timerEnd })
}
