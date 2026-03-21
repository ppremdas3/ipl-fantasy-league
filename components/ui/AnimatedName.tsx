'use client'

import { useState, useEffect } from 'react'

export function AnimatedName({ name }: { name: string }) {
  const [count, setCount] = useState(0)
  const done = count >= name.length

  useEffect(() => {
    if (done) return
    const t = setTimeout(() => setCount(c => c + 1), 500)
    return () => clearTimeout(t)
  }, [count, done])

  return (
    <span>
      {name.slice(0, count)}
      <span className={`text-[#00d4ff]${done ? ' name-dot-blink' : ''}`}>.</span>
    </span>
  )
}
