"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Props {
  currentEmail: string
}

export function EmailForm({ currentEmail }: Props) {
  const [open, setOpen] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/profile/email-change/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, currentPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to send verification email")
        return
      }
      toast.success(data.message || "Verification email sent")
      setOpen(false)
      setNewEmail("")
      setCurrentPassword("")
    } catch {
      toast.error("Failed to send verification email")
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-muted-foreground">Email</div>
          <div className="font-medium">{currentEmail}</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Change email
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border p-4">
      <div className="space-y-1.5">
        <Label className="text-xs">New email</Label>
        <Input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
        <p className="text-xs text-muted-foreground">
          We&apos;ll send a verification link to this address. Your current
          email stays active until you click it.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Current password</Label>
        <Input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false)
            setNewEmail("")
            setCurrentPassword("")
          }}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "Sending…" : "Send verification email"}
        </Button>
      </div>
    </form>
  )
}
