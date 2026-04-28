"use client"

import { useState, useEffect, useMemo } from "react"

export function HeaderDateTime() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const interval = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(interval)
  }, [])

  const { dateStr, timeStr } = useMemo(() => {
    if (!now) return { dateStr: "", timeStr: "" }

    const dateStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Singapore",
      weekday: "short",
      day: "2-digit",
      month: "short",
    }).format(now)

    const timeStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Singapore",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(now)

    return { dateStr, timeStr }
  }, [now])

  if (!now) return null

  return (
    <div className="hidden sm:flex flex-col items-end text-sm tabular-nums" suppressHydrationWarning>
      <span className="text-muted-foreground text-xs">{dateStr}</span>
      <span className="font-mono font-semibold text-xs">{timeStr}</span>
    </div>
  )
}
