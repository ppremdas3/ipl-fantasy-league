'use client'

import { useState } from 'react'
import Image from 'next/image'

const TEAM_GRADIENTS: Record<string, string> = {
  MI:   'from-blue-800 to-blue-600',
  CSK:  'from-yellow-700 to-yellow-500',
  RCB:  'from-red-800 to-red-600',
  KKR:  'from-purple-800 to-purple-600',
  RR:   'from-pink-700 to-pink-500',
  DC:   'from-blue-700 to-sky-500',
  PBKS: 'from-red-700 to-rose-500',
  SRH:  'from-orange-700 to-amber-500',
  LSG:  'from-lime-700 to-green-500',
  GT:   'from-indigo-700 to-violet-500',
}

type Props = {
  name: string
  iplTeam: string
  cricinfoId?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function PlayerAvatar({ name, iplTeam, cricinfoId, size = 'md', className = '' }: Props) {
  const [imgError, setImgError] = useState(false)
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const gradient = TEAM_GRADIENTS[iplTeam] ?? 'from-slate-700 to-slate-500'

  const sizeClasses = {
    sm:  'w-10 h-10 text-xs',
    md:  'w-16 h-16 text-sm',
    lg:  'w-24 h-32 text-base',
  }

  const imageUrl = cricinfoId && !imgError
    ? `https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_320/lsci/db/PICTURES/CMS/${cricinfoId}/${cricinfoId}.jpg`
    : null

  return (
    <div className={`relative rounded-xl overflow-hidden bg-gradient-to-b ${gradient} ${sizeClasses[size]} ${className} flex items-end justify-center`}>
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          className="object-cover object-top"
          onError={() => setImgError(true)}
          unoptimized
        />
      ) : (
        <span className={`absolute inset-0 flex items-center justify-center font-bold text-white/90`}>
          {initials}
        </span>
      )}
    </div>
  )
}
