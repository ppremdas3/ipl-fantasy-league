# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server (localhost:3000)
npm run build     # production build — run this to verify no type/compile errors
npm run lint      # ESLint
npx vercel --prod # deploy to production
```

There are no tests. Verify changes with `npm run build`.

## Critical: Next.js 16 Breaking Changes

This is **Next.js 16.2.0**, not 14 or 15. Key differences that will cause runtime errors if ignored:

- **Auth middleware**: the file is `proxy.ts` (not `middleware.ts`) and the export is `proxy` (not `middleware`)
- **`cookies()`** from `next/headers` is **async** — always `await cookies()`
- **`params`** in page components is a `Promise` — always `await params`
- **`buttonVariants`** must be imported from `components/ui/button-variants.ts` in **server components** — importing from `components/ui/button.tsx` throws a client boundary error because that file has `"use client"`
- **No `asChild` on Button** — shadcn v4 uses `@base-ui/react` which dropped Radix's `asChild`. Use `<Link className={buttonVariants({...})}>` instead of `<Button asChild><Link>`

## Architecture

### Route Groups
- `app/(auth)/` — login, signup (no navbar, centered layout)
- `app/(app)/` — all authenticated pages with navbar; the layout guards auth
- `app/api/` — API routes using the service role key for server-side DB writes
- `app/auth/callback/` — OAuth PKCE code exchange

### Supabase Clients
Three clients, each for a different context:

| File | Use when |
|------|----------|
| `lib/supabase/client.ts` | Client components (`"use client"`) |
| `lib/supabase/server.ts` → `createClient()` | Server components, server actions |
| `lib/supabase/server.ts` → `createAdminClient()` | API routes that need to bypass RLS |

**No `Database` generic on any client** — it was removed because the missing `Relationships` type field caused all query results to be typed as `never`. Cast results with `as unknown as YourType`. For the admin page, the entire client is cast `as any` to avoid complex insert type errors.

Types are manually maintained in `lib/supabase/types.ts`.

### Real-time Auction Flow
1. Commissioner calls `POST /api/auction/start` → sets `auction_sessions` row with `timer_end = now() + 30s`, `status = 'active'`
2. All clients in `AuctionRoom.tsx` subscribe to `postgres_changes` on `auction_sessions` and `auction_bids`
3. User bids via `POST /api/auction/bid` → server validates (amount > current + 25L, budget check, timer not expired), extends `timer_end` by 10s
4. Commissioner calls `POST /api/auction/sold` → inserts `team_players`, deducts `budget_remaining`, sets `status = 'sold'`

### Scoring / Leaderboard Update Flow
Leaderboard is **not live during matches** — updated once after each match ends:
1. Commissioner enters performances in `/admin`
2. Clicks "Recalculate Points" → `POST /api/points/recalculate?match_id=...`
3. API runs `calculatePoints()` from `lib/scoring/fantasy-points.ts` on every player performance
4. Bulk-updates `league_members.total_points`; Supabase Realtime notifies all clients automatically

### Database Currency
All monetary values are in **lakhs** (₹1L = ₹1,00,000). Default budget is 10,000L (₹100 crore). Display divides by 100 to show crores.

### RLS Policy Notes
- The "Leagues viewable by members" policy on the `leagues` table is defined **after** the `league_members` table in the migration — intentional to avoid a forward-reference error. Do not reorder.
- The "Members viewable by league members" policy on `league_members` uses a `security definer` function `get_my_league_ids()` to avoid infinite recursion — a direct subquery on `league_members` within its own RLS policy causes PostgreSQL to recurse infinitely.
