'use client'

import { useState } from 'react'
import TeamLogo from '@/components/ui/TeamLogo'
import { getTeamInfo } from '@/lib/team-colors'

type Match = {
  id: string
  match_number: number
  team1: string
  team2: string
  venue: string | null
  scheduled_at: string | null
  status: string
  result: string | null
}

type Tab = 'all' | 'upcoming' | 'live' | 'completed'

export default function MatchesTabs({ matches }: { matches: Match[] }) {
  const [tab, setTab] = useState<Tab>('upcoming')

  const filtered = matches.filter(m => {
    if (tab === 'all') return true
    return m.status === tab
  })

  const counts = {
    all: matches.length,
    upcoming: matches.filter(m => m.status === 'upcoming').length,
    live: matches.filter(m => m.status === 'live').length,
    completed: matches.filter(m => m.status === 'completed').length,
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'live', label: 'Live' },
    { key: 'completed', label: 'Completed' },
  ]

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`
              flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border whitespace-nowrap transition-all shrink-0
              ${tab === t.key
                ? 'bg-[#ff6b00] border-[#ff6b00] text-white shadow-lg shadow-[#ff6b00]/30'
                : 'bg-card border-border text-muted-foreground hover:border-[#ff6b00]/40 hover:text-white'
              }
            `}
          >
            {t.key === 'live' && counts.live > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            )}
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-md ${
              tab === t.key ? 'bg-white/20' : 'bg-muted'
            }`}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Match tiles */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl py-16 text-center text-muted-foreground text-sm">
          No {tab === 'all' ? '' : tab} matches
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(m => (
            <MatchTile key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  )
}

function MatchTile({ match: m }: { match: Match }) {
  const t1 = getTeamInfo(m.team1)
  const t2 = getTeamInfo(m.team2)

  const statusConfig = {
    live: { label: 'LIVE', dot: true, dotColor: '#22c55e', textColor: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
    upcoming: { label: 'UPCOMING', dot: false, dotColor: '', textColor: '#8891b0', bg: 'rgba(255,255,255,0.04)' },
    completed: { label: 'COMPLETED', dot: false, dotColor: '', textColor: '#60a5fa', bg: 'rgba(96,165,250,0.08)' },
  }[m.status] ?? { label: m.status.toUpperCase(), dot: false, dotColor: '', textColor: '#8891b0', bg: '' }

  const matchDate = m.scheduled_at ? new Date(m.scheduled_at) : null

  return (
    <div className="match-tile-3d group relative overflow-hidden rounded-2xl border border-border cursor-default"
      style={{
        background: '#161829',
        boxShadow: '0 4px 6px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05) inset',
        transform: 'perspective(600px) rotateX(1.5deg)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = 'perspective(600px) rotateX(0deg) translateY(-3px)'
        el.style.boxShadow = '0 8px 12px rgba(0,0,0,0.4), 0 20px 40px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.07) inset'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = 'perspective(600px) rotateX(1.5deg)'
        el.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05) inset'
      }}
    >
      {/* Team color side strips */}
      <div className="absolute inset-y-0 left-0 w-1.5 rounded-l-2xl opacity-80"
        style={{ background: t1 ? `linear-gradient(180deg, ${t1.primary}, ${t1.secondary})` : '#1e2140' }}
      />
      <div className="absolute inset-y-0 right-0 w-1.5 rounded-r-2xl opacity-80"
        style={{ background: t2 ? `linear-gradient(180deg, ${t2.primary}, ${t2.secondary})` : '#1e2140' }}
      />

      {/* Background team color blobs */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 60% 100% at 10% 50%, ${t1?.primary ?? '#fff'} 0%, transparent 70%),
                       radial-gradient(ellipse 60% 100% at 90% 50%, ${t2?.primary ?? '#fff'} 0%, transparent 70%)`,
        }}
      />

      <div className="relative px-6 py-4">
        {/* Top row: match number + status */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-base font-black text-white">Match {m.match_number}</span>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-wider uppercase"
            style={{ background: statusConfig.bg, color: statusConfig.textColor }}
          >
            {statusConfig.dot && (
              <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: statusConfig.dotColor }} />
            )}
            {statusConfig.label}
          </div>
        </div>

        {/* Teams row */}
        <div className="flex items-center justify-between gap-3">
          {/* Team 1 */}
          <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
            <TeamLogo teamName={m.team1} size={68} />
            <p className="font-black text-sm text-white text-center">{t1?.abbr ?? m.team1}</p>
          </div>

          {/* Center: date + vs */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">vs</span>
            {matchDate && (
              <>
                <p className="text-sm font-bold text-white">
                  {matchDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {matchDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST
                </p>
              </>
            )}
            {m.venue && (
              <p className="text-[10px] text-muted-foreground text-center max-w-[100px] leading-tight mt-0.5 hidden sm:block">
                {m.venue}
              </p>
            )}
          </div>

          {/* Team 2 */}
          <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
            <TeamLogo teamName={m.team2} size={68} />
            <p className="font-black text-sm text-white text-center">{t2?.abbr ?? m.team2}</p>
          </div>
        </div>

        {/* Result */}
        {m.result && (
          <div className="mt-3 pt-3 border-t border-border/60 text-center">
            <p className="text-xs text-[#60a5fa]">{m.result}</p>
          </div>
        )}

        {/* Mobile venue */}
        {m.venue && (
          <p className="mt-2 text-center text-[10px] text-muted-foreground sm:hidden">{m.venue}</p>
        )}
      </div>
    </div>
  )
}
