'use client'

import { useEffect, useState } from 'react'

interface AuctionTimerProps {
  timerEnd: string | null
}

export default function AuctionTimer({ timerEnd }: AuctionTimerProps) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!timerEnd) { setSeconds(0); return }

    function update() {
      const diff = Math.max(0, Math.ceil((new Date(timerEnd!).getTime() - Date.now()) / 1000))
      setSeconds(diff)
    }

    update()
    const interval = setInterval(update, 500)
    return () => clearInterval(interval)
  }, [timerEnd])

  const isUrgent = seconds <= 5 && seconds > 0

  return (
    <div className={`text-center ${isUrgent ? 'timer-urgent' : ''}`}>
      <div className={`text-6xl font-black tabular-nums ${
        seconds === 0 ? 'text-muted-foreground' :
        isUrgent ? 'text-red-500' :
        seconds <= 10 ? 'text-[#ff6b00]' : 'text-foreground'
      }`}>
        {seconds.toString().padStart(2, '0')}
      </div>
      <div className="text-xs text-muted-foreground mt-1">seconds</div>
    </div>
  )
}
