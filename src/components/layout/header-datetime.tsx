"use client"

import { useState, useEffect } from "react"

function formatDateTime(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

  const day = days[date.getDay()]
  const dd = date.getDate()
  const month = months[date.getMonth()]

  let hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12 || 12

  return `${day} ${dd} ${month}  ${hours}:${minutes} ${ampm}`
}

export function HeaderDateTime() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  if (!now) return null

  return (
    <span className="text-sm text-muted-foreground whitespace-nowrap tabular-nums" suppressHydrationWarning>
      {formatDateTime(now)}
    </span>
  )
}
