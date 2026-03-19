'use client'

import { useState } from 'react'
import { getTeamInfo } from '@/lib/team-colors'

type Props = {
  teamName: string
  size?: number
  className?: string
}

export default function TeamLogo({ teamName, size = 40, className = '' }: Props) {
  const team = getTeamInfo(teamName)
  const [imgError, setImgError] = useState(false)

  const abbr = team?.abbr ?? teamName.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()

  if (!imgError && team?.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={team.logoUrl}
        alt={teamName}
        width={size}
        height={size}
        className={`object-contain ${className}`}
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    )
  }

  // Initials fallback
  return (
    <div
      className={`flex items-center justify-center rounded-full font-black text-white ${className}`}
      style={{
        width: size,
        height: size,
        background: team ? `linear-gradient(135deg, ${team.primary}, ${team.secondary})` : '#1e2140',
        fontSize: size * 0.28,
      }}
    >
      {abbr}
    </div>
  )
}
