"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Loader2, ShieldOff } from "lucide-react"

interface Props {
  email: string
  alreadyDeactivated: boolean
}

export function DeactivateAccountForm({ email, alreadyDeactivated }: Props) {
  const [open, setOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState("")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch("/api/profile/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmEmail: confirmEmail.trim(),
          reason: reason.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Deactivation failed")
      toast.success("Account deactivated")
      // Sign out so the stale session doesn't let them click around.
      await signOut({ callbackUrl: "/" })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deactivation failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (alreadyDeactivated) {
    return (
      <p className="text-sm text-muted-foreground">
        Your account is currently deactivated.
      </p>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <ShieldOff className="h-4 w-4 mr-2" /> Deactivate my account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate your account?</DialogTitle>
          <DialogDescription>
            This sign-in is disabled immediately. Your records remain on the
            platform; a platform admin is the only way back in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">
              Type your email to confirm: <b>{email}</b>
            </Label>
            <Input
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={email}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Helps us understand why people leave — not required."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={
              submitting ||
              confirmEmail.trim().toLowerCase() !== email.toLowerCase()
            }
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Deactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
