export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string | null
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          username: string
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          username?: string
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
        }
      }
      ipl_players: {
        Row: {
          id: string
          name: string
          ipl_team: string
          role: 'batsman' | 'bowler' | 'all_rounder' | 'wicket_keeper'
          nationality: string | null
          base_price: number
          is_overseas: boolean
          image_url: string | null
          cricinfo_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          ipl_team: string
          role: 'batsman' | 'bowler' | 'all_rounder' | 'wicket_keeper'
          nationality?: string | null
          base_price?: number
          is_overseas?: boolean
          image_url?: string | null
          cricinfo_id?: string | null
        }
        Update: {
          name?: string
          ipl_team?: string
          role?: 'batsman' | 'bowler' | 'all_rounder' | 'wicket_keeper'
          nationality?: string | null
          base_price?: number
          is_overseas?: boolean
          image_url?: string | null
          cricinfo_id?: string | null
        }
      }
      leagues: {
        Row: {
          id: string
          name: string
          invite_code: string
          commissioner_id: string
          max_teams: number
          budget_per_team: number
          status: 'setup' | 'auction' | 'live' | 'completed'
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          invite_code?: string
          commissioner_id: string
          max_teams?: number
          budget_per_team?: number
          status?: 'setup' | 'auction' | 'live' | 'completed'
        }
        Update: {
          name?: string
          invite_code?: string
          commissioner_id?: string
          max_teams?: number
          budget_per_team?: number
          status?: 'setup' | 'auction' | 'live' | 'completed'
        }
      }
      league_members: {
        Row: {
          id: string
          league_id: string
          user_id: string
          team_name: string | null
          budget_remaining: number | null
          total_points: number
          joined_at: string
        }
        Insert: {
          id?: string
          league_id: string
          user_id: string
          team_name?: string | null
          budget_remaining?: number | null
          total_points?: number
        }
        Update: {
          team_name?: string | null
          budget_remaining?: number | null
          total_points?: number
        }
      }
      team_players: {
        Row: {
          id: string
          league_id: string
          member_id: string
          player_id: string
          purchase_price: number
          purchased_at: string
        }
        Insert: {
          id?: string
          league_id: string
          member_id: string
          player_id: string
          purchase_price: number
        }
        Update: {
          purchase_price?: number
        }
      }
      auction_sessions: {
        Row: {
          id: string
          league_id: string
          current_player_id: string | null
          current_highest_bid: number | null
          current_highest_bidder_id: string | null
          timer_end: string | null
          status: 'waiting' | 'active' | 'sold' | 'unsold' | 'completed'
          updated_at: string
        }
        Insert: {
          id?: string
          league_id: string
          current_player_id?: string | null
          current_highest_bid?: number | null
          current_highest_bidder_id?: string | null
          timer_end?: string | null
          status?: 'waiting' | 'active' | 'sold' | 'unsold' | 'completed'
        }
        Update: {
          current_player_id?: string | null
          current_highest_bid?: number | null
          current_highest_bidder_id?: string | null
          timer_end?: string | null
          status?: 'waiting' | 'active' | 'sold' | 'unsold' | 'completed'
          updated_at?: string
        }
      }
      auction_bids: {
        Row: {
          id: string
          session_id: string
          league_id: string
          player_id: string
          bidder_id: string
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          league_id: string
          player_id: string
          bidder_id: string
          amount: number
        }
        Update: never
      }
      ipl_matches: {
        Row: {
          id: string
          match_number: number
          team1: string
          team2: string
          venue: string | null
          scheduled_at: string | null
          status: 'upcoming' | 'live' | 'completed'
          result: string | null
          created_at: string
        }
        Insert: {
          id?: string
          match_number: number
          team1: string
          team2: string
          venue?: string | null
          scheduled_at?: string | null
          status?: 'upcoming' | 'live' | 'completed'
          result?: string | null
        }
        Update: {
          status?: 'upcoming' | 'live' | 'completed'
          result?: string | null
        }
      }
      player_performances: {
        Row: {
          id: string
          match_id: string
          player_id: string
          runs: number
          balls_faced: number
          fours: number
          sixes: number
          is_duck: boolean
          wickets: number
          overs_bowled: number
          runs_conceded: number
          maidens: number
          catches: number
          stumpings: number
          run_outs_direct: number
          run_outs_assist: number
          is_playing_xi: boolean
          fantasy_points: number
          updated_at: string
        }
        Insert: {
          id?: string
          match_id: string
          player_id: string
          runs?: number
          balls_faced?: number
          fours?: number
          sixes?: number
          is_duck?: boolean
          wickets?: number
          overs_bowled?: number
          runs_conceded?: number
          maidens?: number
          catches?: number
          stumpings?: number
          run_outs_direct?: number
          run_outs_assist?: number
          is_playing_xi?: boolean
          fantasy_points?: number
        }
        Update: {
          runs?: number
          balls_faced?: number
          fours?: number
          sixes?: number
          is_duck?: boolean
          wickets?: number
          overs_bowled?: number
          runs_conceded?: number
          maidens?: number
          catches?: number
          stumpings?: number
          run_outs_direct?: number
          run_outs_assist?: number
          is_playing_xi?: boolean
          fantasy_points?: number
          updated_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type IplPlayer = Tables<'ipl_players'>
export type League = Tables<'leagues'>
export type LeagueMember = Tables<'league_members'>
export type TeamPlayer = Tables<'team_players'>
export type AuctionSession = Tables<'auction_sessions'>
export type AuctionBid = Tables<'auction_bids'>
export type IplMatch = Tables<'ipl_matches'>
export type PlayerPerformance = Tables<'player_performances'>
export type Profile = Tables<'profiles'>
