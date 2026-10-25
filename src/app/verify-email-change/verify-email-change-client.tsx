"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react"

type State =
  | { status: "verifying" }
  | { status: "success"; message: string }
  | { status: "error"; error: string }

export function VerifyEmailChangeClient() {
  const params = useSearchParams()
  const token = params.get("token")
  const [state, setState] = useState<State>(() =>
    token ? { status: "verifying" } : { status: "error", error: "Missing verification token." }
  )
  const sentRef = useRef(false)

  useEffect(() => {
    if (sentRef.current || !token) return
    sentRef.current = true

    fetch("/api/profile/email-change/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setState({
            status: "error",
            error: data.error ?? "Failed to verify email change.",
          })
          return
        }
        setState({
          status: "success",
          message: data.message ?? "Email updated.",
        })
      })
      .catch(() => {
        setState({
          status: "error",
          error: "Network error. Please try again.",
        })
      })
  }, [token])

  if (state.status === "verifying") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Verifying your new email…</p>
      </div>
    )
  }

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <h1 className="text-xl font-semibold">Email updated</h1>
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <AlertTriangle className="h-10 w-10 text-red-600" />
      <h1 className="text-xl font-semibold">Verification failed</h1>
      <p className="text-sm text-muted-foreground">{state.error}</p>
      <Button asChild variant="outline">
        <Link href="/learner/profile">Back to profile</Link>
      </Button>
    </div>
  )
}
