'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const BID_INCREMENTS = [25, 50, 100, 200, 500]

interface Props {
  currentBid: number
  myBudget: number
  isHighestBidder: boolean
  onBid: (amount: number) => void
  loading: boolean
}

export default function BidButton({ currentBid, myBudget, isHighestBidder, onBid, loading }: Props) {
  const [customAmount, setCustomAmount] = useState('')

  function quickBid(increment: number) {
    const amount = currentBid + increment
    if (amount > myBudget) return
    onBid(amount)
  }

  function handleCustomBid(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseInt(customAmount)
    if (isNaN(amount) || amount <= currentBid) return
    onBid(amount)
    setCustomAmount('')
  }

  if (isHighestBidder) {
    return (
      <div className="bg-[#00d4aa]/10 border border-[#00d4aa]/30 rounded-xl p-4 text-center">
        <p className="text-[#00d4aa] font-semibold">You are the highest bidder! 🏆</p>
        <p className="text-sm text-muted-foreground mt-1">Wait for the timer or someone to outbid you.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Place a bid</p>
      <div className="flex flex-wrap gap-2">
        {BID_INCREMENTS.map(inc => {
          const amount = currentBid + inc
          const disabled = amount > myBudget || loading
          return (
            <Button
              key={inc}
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => quickBid(inc)}
              className="border-[#ff6b00]/50 text-[#ff6b00] hover:bg-[#ff6b00]/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              +₹{inc}L → ₹{amount}L
            </Button>
          )
        })}
      </div>
      <form onSubmit={handleCustomBid} className="flex gap-2">
        <Input
          type="number"
          placeholder={`Custom amount (min ₹${currentBid + 25}L)`}
          value={customAmount}
          onChange={e => setCustomAmount(e.target.value)}
          min={currentBid + 25}
          max={myBudget}
          className="bg-input border-border"
        />
        <Button
          type="submit"
          className="bg-[#ff6b00] hover:bg-[#e55c00] text-white shrink-0"
          disabled={loading || !customAmount}
        >
          {loading ? '…' : 'Bid'}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Your budget: <span className="text-[#00d4aa] font-bold">₹{myBudget}L</span> remaining
      </p>
    </div>
  )
}
