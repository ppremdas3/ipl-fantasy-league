export function IPLFantasyIcon({ className = '', size = 40 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 38 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size * (44 / 38)}
      className={className}
    >
      <defs>
        <linearGradient id="stumpGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f86f7" />
          <stop offset="100%" stopColor="#1a3580" />
        </linearGradient>
        <linearGradient id="bailGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3b6ae8" />
          <stop offset="100%" stopColor="#5a90ff" />
        </linearGradient>
        <linearGradient id="swooshGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#1a3580" />
          <stop offset="55%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#00d4ff" />
        </linearGradient>
        <filter id="swooshGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="starGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Left stump */}
      <rect x="2"    y="14" width="5" height="28" rx="2" fill="url(#stumpGrad)" />
      {/* Center stump */}
      <rect x="16.5" y="14" width="5" height="28" rx="2" fill="url(#stumpGrad)" />
      {/* Right stump */}
      <rect x="31"   y="14" width="5" height="28" rx="2" fill="url(#stumpGrad)" />

      {/* Left bail */}
      <rect x="2"    y="11.5" width="19.5" height="3.5" rx="1.75" fill="url(#bailGrad)" />
      {/* Right bail */}
      <rect x="16.5" y="11.5" width="19.5" height="3.5" rx="1.75" fill="url(#bailGrad)" />

      {/* Swoosh arc — bottom-left to star (top-right) */}
      <path
        d="M 1,43 C 6,32 16,18 28,5"
        stroke="url(#swooshGrad)"
        strokeWidth="2.8"
        fill="none"
        strokeLinecap="round"
        filter="url(#swooshGlow)"
      />

      {/* 4-pointed sparkle star at (28, 5) */}
      <path
        d="M28,0.5 L29.2,3.5 L32.5,5 L29.2,6.5 L28,9.5 L26.8,6.5 L23.5,5 L26.8,3.5 Z"
        fill="#00d4ff"
        filter="url(#starGlow)"
      />
    </svg>
  )
}

export function IPLFantasyLogo({ iconSize = 40 }: { iconSize?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <IPLFantasyIcon size={iconSize} />
      <div className="flex flex-col leading-none gap-0.5">
        <span
          className="font-orbitron font-800 text-white tracking-[0.12em] uppercase"
          style={{ fontSize: iconSize * 0.38 }}
        >
          IPL
        </span>
        <span
          className="font-orbitron font-900 uppercase tracking-[0.1em]"
          style={{
            fontSize: iconSize * 0.48,
            background: 'linear-gradient(90deg, #00aaff, #00d4ff, #00ffee)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.6))',
          }}
        >
          Fantasy
        </span>
      </div>
    </div>
  )
}
